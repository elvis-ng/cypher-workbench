#!/usr/bin/env python3
"""Promote paired Cypher Workbench ECR images without ECS deployment."""
import argparse, json, os, re, subprocess, sys
from pathlib import Path
from dataclasses import dataclass

ACCOUNT = "405567561446"
REGION = "eu-central-1"
REPOS = ("elvisng-cypher-workbench-api", "elvisng-cypher-workbench-ui")

class PromotionError(RuntimeError):
    pass

class AwsEcr:
    def __init__(self, account=ACCOUNT, region=REGION, runner=subprocess.run):
        self.account, self.region, self.runner = account, region, runner

    def call(self, operation, *args):
        cmd = ["aws", "ecr", operation, "--region", self.region, "--registry-id", self.account, *args, "--output", "json"]
        result = self.runner(cmd, check=False, capture_output=True, text=True)
        if result.returncode:
            raise PromotionError(result.stderr.strip() or f"aws ecr {operation} failed")
        try:
            return json.loads(result.stdout or "{}")
        except json.JSONDecodeError as exc:
            raise PromotionError(f"invalid AWS response from {operation}") from exc

    def caller_account(self):
        cmd = ["aws", "sts", "get-caller-identity", "--query", "Account", "--output", "text"]
        result = self.runner(cmd, check=False, capture_output=True, text=True)
        if result.returncode:
            raise PromotionError(result.stderr.strip() or "unable to verify AWS caller")
        return result.stdout.strip()

    def image(self, repo, tag):
        data = self.call("batch-get-image", "--repository-name", repo, "--image-ids", f"imageTag={tag}")
        failures = data.get("failures", [])
        if failures:
            reason = failures[0].get("failureCode", failures[0].get("failureReason", "unknown"))
            if reason in {"ImageNotFound", "ImageTagDoesNotMatchDigest"}:
                return None
            raise PromotionError(f"batch-get-image failed for {repo}:{tag}: {reason}")
        images = data.get("images", [])
        if not images:
            return None
        image = images[0]
        digest = image.get("imageId", {}).get("imageDigest")
        manifest = image.get("imageManifest")
        media_type = image.get("imageManifestMediaType")
        if not re.fullmatch(r"sha256:[0-9a-f]{64}", digest or "") or not manifest or media_type not in {"application/vnd.docker.distribution.manifest.v2+json", "application/vnd.oci.image.manifest.v1+json", "application/vnd.docker.distribution.manifest.list.v2+json", "application/vnd.oci.image.index.v1+json"}:
            raise PromotionError(f"invalid manifest response for {repo}:{tag}")
        described = self.call("describe-images", "--repository-name", repo, "--image-ids", f"imageDigest={digest}")
        failures = described.get("failures", [])
        if failures or len(described.get("imageDetails", [])) != 1:
            raise PromotionError(f"describe-images failed for {repo}:{tag}")
        details = described["imageDetails"][0]
        return Image(digest, manifest, media_type, tuple(details.get("imageTags", [])))

    def put(self, repo, tag, image):
        args = ["--repository-name", repo, "--image-tag", tag, "--image-manifest", image.manifest]
        if image.media_type:
            args += ["--image-manifest-media-type", image.media_type]
        result = self.call("put-image", *args)
        returned = result.get("image", {}).get("imageId", {}).get("imageDigest")
        if returned and returned != image.digest:
            raise PromotionError(f"put-image digest mismatch for {repo}:{tag}")
        if result.get("failures"):
            raise PromotionError(f"put-image failed for {repo}:{tag}")

    def delete(self, repo, tag):
        result = self.call("batch-delete-image", "--repository-name", repo, "--image-ids", f"imageTag={tag}")
        if result.get("failures"):
            raise PromotionError(f"batch-delete-image failed for {repo}:{tag}")

@dataclass(frozen=True)
class Image:
    digest: str
    manifest: str
    media_type: str | None = None
    tags: tuple = ()

def full_sha(ref):
    if not re.fullmatch(r"[0-9a-fA-F]{40}", ref or ""):
        raise PromotionError("SOURCE_REF must be a full 40-character hexadecimal checkout SHA")
    return ref.lower()

def verify_source(client, image_tag, source_ref):
    full = full_sha(source_ref)
    alias = full[:7]
    sources = {}
    for repo in REPOS:
        tagged = client.image(repo, image_tag)
        commit = client.image(repo, alias)
        if not tagged:
            raise PromotionError(f"missing source image: {repo}:{image_tag}")
        if not commit:
            raise PromotionError(f"missing source commit alias: {repo}:{alias}")
        if tagged.digest != commit.digest:
            raise PromotionError(f"source tag and {alias} alias mismatch: {repo}")
        sources[repo] = tagged
    return sources

def same_presence(images, tag):
    present = [bool(images[repo][tag]) for repo in REPOS]
    if present[0] != present[1]:
        raise PromotionError(f"asymmetric prior {tag} state")

def restore(client, repo, tag, previous, expected_digest, errors):
    try:
        current = client.image(repo, tag)
        if (current.digest if current else None) == (previous.digest if previous else None):
            return
        if not current or current.digest != expected_digest:
            raise PromotionError(f"concurrent change detected before rollback: {repo}:{tag}")
        if previous is None:
            client.delete(repo, tag)
        else:
            client.put(repo, tag, previous)
    except Exception as exc:
        errors.append(f"rollback {repo}:{tag}: {exc}")

def promote(client, stage, image_tag, source_ref):
    if stage not in {"dev", "qa", "test", "prod"}:
        raise PromotionError("STAGE must be dev, qa, test, or prod")
    sources = verify_source(client, image_tag, source_ref)
    tags = [stage]
    if stage == "prod":
        tags.append("prod-previous")
    snapshots = {repo: {tag: client.image(repo, tag) for tag in tags} for repo in REPOS}
    same_presence(snapshots, stage)
    if stage == "prod":
        same_presence(snapshots, "prod-previous")

    changed = []
    try:
        for repo in REPOS:
            old = snapshots[repo][stage]
            current = client.image(repo, stage)
            if (current.digest if current else None) != (old.digest if old else None):
                raise PromotionError(f"concurrent change detected: {repo}:{stage}")
            changed.append((repo, stage, sources[repo].digest))
            client.put(repo, stage, sources[repo])
        if stage == "prod":
            for repo in REPOS:
                old_prod = snapshots[repo][stage]
                if old_prod:
                    current_previous = client.image(repo, "prod-previous")
                    prior = snapshots[repo]["prod-previous"]
                    if (current_previous.digest if current_previous else None) != (prior.digest if prior else None):
                        raise PromotionError(f"concurrent change detected: {repo}:prod-previous")
                    changed.append((repo, "prod-previous", old_prod.digest))
                    client.put(repo, "prod-previous", old_prod)
    except Exception as exc:
        errors = []
        for repo, tag, digest in reversed(changed):
            restore(client, repo, tag, snapshots[repo].get(tag), digest, errors)
        detail = f"promotion failed: {exc}"
        if errors:
            detail += "; compensation errors: " + " | ".join(errors)
        raise PromotionError(detail) from exc
    return sources

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", default=os.getenv("STAGE", "qa"))
    parser.add_argument("--image-tag", default=os.getenv("IMAGE_TAG", "dev"))
    parser.add_argument("--source-ref", default=os.getenv("SOURCE_REF", "master"))
    args = parser.parse_args()
    client = AwsEcr()
    if client.caller_account() != ACCOUNT:
        raise PromotionError(f"unexpected AWS account; expected {ACCOUNT}")
    sources = promote(client, args.stage, args.image_tag, args.source_ref)
    print("Promoted paired API/UI images to %s: %s" % (args.stage, ", ".join(f"{repo}={image.digest}" for repo, image in sources.items())))
    if os.getenv('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as summary:
            summary.write(f'### Workbench image pair: {args.stage}\n\nSource: `{full_sha(args.source_ref)}`\n\n')
            for repo, image in sources.items():
                summary.write(f'- `{ACCOUNT}.dkr.ecr.{REGION}.amazonaws.com/{repo}@{image.digest}`\n')
            summary.write('\nTag promotion only; no ECS deployment performed.\n')

if __name__ == "__main__":
    try:
        main()
    except PromotionError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)

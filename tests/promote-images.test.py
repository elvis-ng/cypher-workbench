import importlib.util
import pathlib
import unittest
from dataclasses import replace

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("promote_images", ROOT / "scripts/promote-images.py")
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)

class FakeClient:
    def __init__(self, images, fail_on=None, mutate_on=None):
        self.images = {repo: dict(tags) for repo, tags in images.items()}
        self.fail_on = fail_on
        self.mutate_on = mutate_on
        self.calls = []

    def image(self, repo, tag):
        return self.images.get(repo, {}).get(tag)

    def put(self, repo, tag, image):
        self.calls.append(("put", repo, tag))
        if self.fail_on == (repo, tag):
            raise mod.PromotionError("put failed")
        self.images.setdefault(repo, {})[tag] = image

    def delete(self, repo, tag):
        self.calls.append(("delete", repo, tag))
        if self.fail_on == (repo, tag):
            raise mod.PromotionError("delete failed")
        self.images.get(repo, {}).pop(tag, None)

class PromotionTests(unittest.TestCase):
    def setUp(self):
        self.source = {
            repo: {
                "dev": mod.Image("sha256:" + ('a' if repo.endswith('api') else 'b') * 64, "manifest", "application/vnd.oci.image.manifest.v1+json"),
                "abcdef1": mod.Image("sha256:" + ('a' if repo.endswith('api') else 'b') * 64, "manifest", "application/vnd.oci.image.manifest.v1+json"),
            }
            for repo in mod.REPOS
        }

    def test_fresh_commit_pair_can_be_tagged_dev(self):
        images = {repo: {'abcdef1': tags['abcdef1']} for repo, tags in self.source.items()}
        client = FakeClient(images)
        mod.promote(client, 'dev', 'abcdef1', 'abcdef123456789abcdef123456789abcdef1234')
        for repo in mod.REPOS:
            self.assertEqual(client.image(repo, 'dev'), self.source[repo]['abcdef1'])

    def test_applied_write_with_lost_response_is_restored(self):
        client = FakeClient(self.source)
        original_put = client.put
        def put_with_lost_response(repo, tag, image):
            original_put(repo, tag, image)
            if repo == mod.REPOS[1] and tag == 'qa':
                raise mod.PromotionError('response lost after write')
        client.put = put_with_lost_response
        with self.assertRaises(mod.PromotionError):
            mod.promote(client, 'qa', 'dev', 'abcdef123456789abcdef123456789abcdef1234')
        for repo in mod.REPOS:
            self.assertIsNone(client.image(repo, 'qa'))

    def test_production_preserves_prior_pair(self):
        old = {repo: replace(tags['dev'], digest='sha256:' + ('1' if repo.endswith('api') else '2') * 64)
               for repo, tags in self.source.items()}
        client = FakeClient({repo: {**tags, 'prod': old[repo]} for repo, tags in self.source.items()})
        mod.promote(client, 'prod', 'dev', 'abcdef123456789abcdef123456789abcdef1234')
        for repo in mod.REPOS:
            self.assertEqual(client.image(repo, 'prod-previous'), old[repo])
            self.assertEqual(client.image(repo, 'prod'), self.source[repo]['dev'])

    def test_missing_source_rejected(self):
        images = {repo: dict(tags) for repo, tags in self.source.items()}
        del images[mod.REPOS[0]]["dev"]
        client = FakeClient(images)
        with self.assertRaisesRegex(mod.PromotionError, "missing source image"):
            mod.promote(client, "qa", "dev", "abcdef123456789abcdef123456789abcdef1234")

    def test_source_alias_digest_mismatch_rejected(self):
        self.source[mod.REPOS[0]]["abcdef1"] = replace(self.source[mod.REPOS[0]]["dev"], digest="sha256:" + "c" * 64)
        with self.assertRaisesRegex(mod.PromotionError, "alias mismatch"):
            mod.promote(FakeClient(self.source), "qa", "dev", "abcdef123456789abcdef123456789abcdef1234")

    def test_partial_failure_rolls_back_pair(self):
        old = {repo: mod.Image(f"sha256:{'1' if repo.endswith('api') else '2'}" * 64, "old", "type") for repo in mod.REPOS}
        images = {repo: {**self.source[repo], "qa": old[repo]} for repo in mod.REPOS}
        client = FakeClient(images, fail_on=(mod.REPOS[1], "qa"))
        with self.assertRaisesRegex(mod.PromotionError, "promotion failed"):
            mod.promote(client, "qa", "dev", "abcdef123456789abcdef123456789abcdef1234")
        self.assertEqual(client.image(mod.REPOS[0], "qa"), old[mod.REPOS[0]])

    def test_absent_target_is_deleted_on_rollback(self):
        client = FakeClient(self.source, fail_on=(mod.REPOS[1], "qa"))
        with self.assertRaises(mod.PromotionError):
            mod.promote(client, "qa", "dev", "abcdef123456789abcdef123456789abcdef1234")
        self.assertIsNone(client.image(mod.REPOS[0], "qa"))
        self.assertIn(("delete", mod.REPOS[0], "qa"), client.calls)

    def test_prod_previous_asymmetry_rejected(self):
        images = {repo: dict(self.source[repo]) for repo in mod.REPOS}
        images[mod.REPOS[0]]["prod-previous"] = mod.Image("sha256:" + "d" * 64, "m", "t")
        with self.assertRaisesRegex(mod.PromotionError, "asymmetric prior prod-previous"):
            mod.promote(FakeClient(images), "prod", "dev", "abcdef123456789abcdef123456789abcdef1234")

    def test_compensation_error_is_reported(self):
        old = {repo: mod.Image(f"sha256:{'1' if repo.endswith('api') else '2'}" * 64, "old", "type") for repo in mod.REPOS}
        images = {repo: {**self.source[repo], "qa": old[repo]} for repo in mod.REPOS}
        client = FakeClient(images, fail_on=(mod.REPOS[1], "qa"))
        original_image = client.image
        def concurrent(repo, tag):
            if (repo, tag) == (mod.REPOS[0], "qa") and ("put", mod.REPOS[0], "qa") in client.calls:
                return mod.Image("sha256:" + "e" * 64, "other", "type")
            return original_image(repo, tag)
        client.image = concurrent
        with self.assertRaisesRegex(mod.PromotionError, "compensation errors"):
            mod.promote(client, "qa", "dev", "abcdef123456789abcdef123456789abcdef1234")

if __name__ == "__main__":
    unittest.main()

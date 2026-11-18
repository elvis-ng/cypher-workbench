# Workbench image releases

Workbench uses two dedicated ECR repositories in the shared account:

- `405567561446.dkr.ecr.eu-central-1.amazonaws.com/elvisng-cypher-workbench-api`
- `405567561446.dkr.ecr.eu-central-1.amazonaws.com/elvisng-cypher-workbench-ui`

The repositories must be deployed from the owning `elvis-backup` CDK stack before publication. Workflow/environment permissions and image security checks are separate prerequisites.

## Publish a dev release

Run **Workbench - Publish images** in the private `elvis-ng/elvis-backoffice` repository. Supply `WORKBENCH_SHA`, the full reviewed 40-character commit SHA from this repository. Backoffice checks out that revision only as build input; native source is not vendored there. It builds both ARM64 images, publishes their common seven-character commit tag, then moves both `dev` tags only after both commit images exist. Existing commit tags are not overwritten. The workflow prints immutable image references after paired tagging succeeds.

A failed build or commit push does not advance `dev`. If only one commit image was uploaded, inspect the failed run before retrying; the publisher deliberately refuses existing commit tags. Do not delete a deployed image to bypass that check.

## Promote an existing release

Run **Workbench - Promote images** in `elvis-ng/elvis-backoffice`:

1. Set `IMAGE_TAG` to the source tag, such as `dev` or a seven-character commit tag.
2. Set `WORKBENCH_SHA` to the full source commit SHA whose commit images match that tag.
3. Select destination `qa`, `test`, or `prod`.

Promotion copies ECR manifests without rebuilding. Both source images must match the same source commit alias. Production promotion preserves the prior pair under `prod-previous`. Both workflows serialize their operations; stage environment approvals still apply.

ECR has no cross-repository transaction. Promotion attempts to restore changed tags if a later operation fails. If compensation fails or another writer changes a tag, inspect the reported repository/tag states before retrying.

## Retention and deployment

Repository lifecycle rules use the existing application policy to protect exact `dev`, `qa`, `test`, `prod`, `master`, and `prod-previous` tags from general image cleanup. Older images without a protected tag remain eligible for cleanup. A digest reference alone does not protect an image from deletion.

These workflows publish/promote images only. They do not deploy Backoffice, change databases, or activate Workbench. Backoffice's sidecars consume immutable API/UI digests; updating ECR tags does not update the ECS task definition. Keep deployed images under a protected stage/rollback tag and supply the promoted digest pair to the separately reviewed Backoffice infrastructure deployment.

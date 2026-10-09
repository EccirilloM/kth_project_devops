terraform {
  # Existing state must be migrated before enabling the deployment workflow.
  # Bucket/key/region and any compatible endpoint are supplied at terraform init.
  backend "s3" {
    use_lockfile = true
  }
}

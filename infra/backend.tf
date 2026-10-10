terraform {
  # Persistent state is separate from the disposable Docker laboratory.
  # Bucket/key/region and any compatible endpoint are supplied at terraform init.
  backend "s3" {
    use_lockfile = true
  }
}

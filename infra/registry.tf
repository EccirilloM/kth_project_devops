terraform {
  required_version = ">= 1.13, < 2"
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.40"
    }
  }
}

provider "digitalocean" {}

variable "region" {
  type    = string
  default = "ams"
}

variable "registry_name" {
  type    = string
  default = "mqtt-emulator-dev"
}

locals {
  docr_region = lookup(
    {
      ams = "ams3"
      nyc = "nyc3"
      sfo = "sfo3"
      sgp = "sgp1"
      lon = "lon1"
      fra = "fra1"
      tor = "tor1"
      blr = "blr1"
      syd = "syd1"
    },
    var.region,
    "${var.region}3",
  )
}

resource "digitalocean_container_registry" "mqtt" {
  name                   = var.registry_name
  subscription_tier_slug = "starter"
  region                 = local.docr_region
}


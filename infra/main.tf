terraform {
  required_version = ">= 1.5"
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.40"
    }
  }
}

provider "digitalocean" {}

variable "region" {
  description = "Shared region for App Platform and DOCR (App Platform slug: ams, nyc, fra, …)"
  type        = string
  default     = "ams"
}

variable "registry_name" {
  description = "Container registry name to create (must be unique)"
  type        = string
  default     = "mqtt-emulator-dev"
}

variable "mosquitto_repository" {
  type        = string
  default     = "mqtt-mosquitto"
}

variable "simulator_repository" {
  type        = string
  default     = "mqtt-emulator"
}

variable "image_tag" {
  type    = string
  default = "latest"
}

variable "simulator_password" {
  type        = string
  default     = "simulatorpass"
  sensitive   = true
}

variable "instance_size" {
  type    = string
  default = "basic-xxs"
}

variable "domain" {
  description = "Custom hostname for the emulator (PRIMARY app domain)"
  type        = string
  default     = ""
}

variable "zone" {
  type        = string
  default     = ""
}

variable "project_name" {
  type        = string
  default     = "devopsboatproject"
}

locals {
  # Little conversion of regions is needed cause app platform uses different region names
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

  broker_host = (
    var.domain != ""
    ? var.domain
    : trimsuffix(trimprefix(digitalocean_app.mqtt.default_ingress, "https://"), "/")
  )
}

# we could have went for ghcr but we have to use digital ocean's CR cause of app platform shinanigans
resource "digitalocean_container_registry" "mqtt" {
  name                   = var.registry_name
  subscription_tier_slug = "starter"
  region                 = local.docr_region
}

resource "digitalocean_app" "mqtt" {
  spec {
    name   = "mqtt-emulator"
    region = var.region

    dynamic "domain" {
      for_each = var.domain != "" ? [var.domain] : []
      content {
        name = domain.value
        type = "PRIMARY"
      }
    }

    ingress {
      rule {
        component {
          name                 = "mosquitto"
          preserve_path_prefix = true
        }
        match {
          path {
            prefix = "/mqtt"
          }
        }
      }
    }

    service {
      name               = "mosquitto"
      instance_count     = 1
      instance_size_slug = var.instance_size
      http_port          = 9001
      internal_ports     = [1883]

      image {
        registry_type = "DOCR"
        repository = "${digitalocean_container_registry.mqtt.name}/${var.mosquitto_repository}"
        tag        = var.image_tag
        deploy_on_push {
          enabled = true
        }
      }
    }

    worker {
      name               = "simulator"
      instance_count     = 1
      instance_size_slug = var.instance_size

      image {
        registry_type = "DOCR"
        repository    = "${digitalocean_container_registry.mqtt.name}/${var.simulator_repository}"
        tag           = var.image_tag
        deploy_on_push {
          enabled = true
        }
      }

      env {
        key   = "MQTT_URL"
        value = "mqtt://mosquitto:1883"
      }

      env {
        key   = "MQTT_USERNAME"
        value = "simulator"
      }

      env {
        key   = "MQTT_PASSWORD"
        value = var.simulator_password
        type  = "SECRET"
      }

      env {
        key   = "MQTT_CLIENT_ID"
        value = "sail-sim-1"
      }
    }
  }
}

resource "digitalocean_record" "mqtt" {
  count = var.domain != "" && var.zone != "" ? 1 : 0

  domain = var.zone
  type   = "CNAME"
  name   = var.domain == var.zone ? "@" : trimsuffix(var.domain, ".${var.zone}")
  value  = "${trimsuffix(trimprefix(digitalocean_app.mqtt.default_ingress, "https://"), "/")}."
  ttl    = 300
}

resource "digitalocean_project" "this" {
  count       = var.project_name != "" ? 1 : 0
  name        = var.project_name
  description = "Boat MQTT emulator (for dev)"
  purpose     = "Web App"
  environment = "dev"
}

resource "digitalocean_project_resources" "this" {
  count   = var.project_name != "" ? 1 : 0
  project = digitalocean_project.this[0].id
  resources = [
    digitalocean_app.mqtt.urn,
  ]
}

output "app_id" {
  value = digitalocean_app.mqtt.id
}

output "app_url" {
  value = digitalocean_app.mqtt.live_url
}

output "default_ingress" {
  value = digitalocean_app.mqtt.default_ingress
}

output "broker_wss_url" {
  value       = "wss://${local.broker_host}/mqtt"
}

output "registry_name" {
  value = digitalocean_container_registry.mqtt.name
}

output "registry_endpoint" {
  value = digitalocean_container_registry.mqtt.endpoint
}

output "simulator_image" {
  value = "${digitalocean_container_registry.mqtt.endpoint}/${var.simulator_repository}:${var.image_tag}"
}

output "mosquitto_image" {
  value = "${digitalocean_container_registry.mqtt.endpoint}/${var.mosquitto_repository}:${var.image_tag}"
}

output "project_id" {
  value = try(digitalocean_project.this[0].id, null)
}

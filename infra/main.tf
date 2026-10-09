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
  type        = string
  default     = "ams"
}

variable "registry_name" {
  type    = string
  default = "mqtt-emulator-dev"
}

variable "image_repository" {
  type    = string
  default = "mqtt"
}

variable "mosquitto_tag" {
  type    = string
  default = "mosquitto"
}

variable "simulator_tag" {
  type    = string
  default = "simulator"
}

variable "frontend_tag" {
  type    = string
  default = "frontend"
}

variable "simulator_password" {
  type      = string
  default   = "simulatorpass"
  sensitive = true
}

variable "instance_size" {
  type    = string
  default = "basic-xxs"
}

variable "domain" {
  type    = string
  default = ""
}

variable "zone" {
  type    = string
  default = ""
}

variable "project_name" {
  type    = string
  default = ""
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

  broker_host = (
    var.domain != ""
    ? var.domain
    : trimsuffix(trimprefix(digitalocean_app.mqtt.default_ingress, "https://"), "/")
  )
}

resource "digitalocean_container_registry" "mqtt" {
  name                   = var.registry_name
  subscription_tier_slug = "starter"
  region                 = local.docr_region
}

resource "digitalocean_app" "mqtt" {
  depends_on = [digitalocean_container_registry.mqtt]

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

      rule {
        component {
          name = "frontend"
        }
        match {
          path {
            prefix = "/"
          }
        }
      }
    }

    service {
      name               = "frontend"
      instance_count     = 1
      instance_size_slug = var.instance_size
      http_port          = 80

      image {
        registry_type = "DOCR"
        registry      = digitalocean_container_registry.mqtt.name
        repository    = var.image_repository
        tag           = var.frontend_tag
        deploy_on_push {
          enabled = true
        }
      }

      env {
        key   = "APP_URL"
        value = "$${APP_URL}"
      }

      dynamic "env" {
        for_each = var.domain != "" ? [var.domain] : []
        content {
          key   = "MQTT_BROKER_URL"
          value = "wss://${env.value}/mqtt"
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
        registry      = digitalocean_container_registry.mqtt.name
        repository    = var.image_repository
        tag           = var.mosquitto_tag
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
        registry      = digitalocean_container_registry.mqtt.name
        repository    = var.image_repository
        tag           = var.simulator_tag
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
  description = "Boat MQTT emulator (dev)"
  purpose     = "Web App"
  environment = "Development"
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

output "broker_wss_url" {
  value = "wss://${local.broker_host}/mqtt"
}

output "registry_name" {
  value = digitalocean_container_registry.mqtt.name
}

output "registry_endpoint" {
  value = digitalocean_container_registry.mqtt.endpoint
}

output "simulator_image" {
  value = "${digitalocean_container_registry.mqtt.endpoint}/${var.image_repository}:${var.simulator_tag}"
}

output "mosquitto_image" {
  value = "${digitalocean_container_registry.mqtt.endpoint}/${var.image_repository}:${var.mosquitto_tag}"
}

output "frontend_image" {
  value = "${digitalocean_container_registry.mqtt.endpoint}/${var.image_repository}:${var.frontend_tag}"
}

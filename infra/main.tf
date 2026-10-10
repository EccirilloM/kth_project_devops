variable "image_repository" {
  type    = string
  default = "mqtt"
}

variable "mosquitto_digest" {
  type = string
  validation {
    condition     = can(regex("^sha256:[a-f0-9]{64}$", var.mosquitto_digest))
    error_message = "Supply the digest of the verified image."
  }
}

variable "simulator_digest" {
  type = string
  validation {
    condition     = can(regex("^sha256:[a-f0-9]{64}$", var.simulator_digest))
    error_message = "Supply the digest of the verified image."
  }
}

variable "frontend_digest" {
  type = string
  validation {
    condition     = can(regex("^sha256:[a-f0-9]{64}$", var.frontend_digest))
    error_message = "Supply the digest of the verified image."
  }
}

variable "guest_password" {
  type      = string
  sensitive = true
  validation {
    condition     = can(regex("^[A-Za-z0-9_-]{24,128}$", var.guest_password))
    error_message = "Use 24..128 URL-safe characters for broker passwords."
  }
}

variable "operator_password" {
  type      = string
  sensitive = true
  validation {
    condition     = can(regex("^[A-Za-z0-9_-]{24,128}$", var.operator_password))
    error_message = "Use 24..128 URL-safe characters for broker passwords."
  }
}

variable "simulator_password" {
  type      = string
  sensitive = true
  validation {
    condition     = can(regex("^[A-Za-z0-9_-]{24,128}$", var.simulator_password))
    error_message = "Use 24..128 URL-safe characters for broker passwords."
  }
}

variable "instance_size" {
  type    = string
  default = "basic-xxs"
}

variable "app_name" {
  type    = string
  default = "mqtt-emulator"
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
  broker_host = (
    var.domain != ""
    ? var.domain
    : trimsuffix(trimprefix(digitalocean_app.mqtt.default_ingress, "https://"), "/")
  )
}

resource "digitalocean_app" "mqtt" {
  depends_on = [digitalocean_container_registry.mqtt]

  spec {
    name   = var.app_name
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
        # DOCR uses the account's single registry; the registry field must be omitted.
        registry_type = "DOCR"
        repository    = var.image_repository
        digest        = var.frontend_digest
        deploy_on_push {
          enabled = false
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

      env {
        key   = "BROKER_GUEST_PASSWORD"
        value = var.guest_password
        type  = "SECRET"
      }
      env {
        key   = "BROKER_OPERATOR_PASSWORD"
        value = var.operator_password
        type  = "SECRET"
      }
      env {
        key   = "BROKER_SIMULATOR_PASSWORD"
        value = var.simulator_password
        type  = "SECRET"
      }

      image {
        registry_type = "DOCR"
        repository    = var.image_repository
        digest        = var.mosquitto_digest
        deploy_on_push {
          enabled = false
        }
      }
    }

    worker {
      name               = "simulator"
      instance_count     = 1
      instance_size_slug = var.instance_size

      image {
        registry_type = "DOCR"
        repository    = var.image_repository
        digest        = var.simulator_digest
        deploy_on_push {
          enabled = false
        }
      }

      env {
        key   = "MQTT_URL"
        value = "mqtt://$${mosquitto.PRIVATE_DOMAIN}:1883"
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
  value = "${digitalocean_container_registry.mqtt.endpoint}/${var.image_repository}@${var.simulator_digest}"
}

output "mosquitto_image" {
  value = "${digitalocean_container_registry.mqtt.endpoint}/${var.image_repository}@${var.mosquitto_digest}"
}

output "frontend_image" {
  value = "${digitalocean_container_registry.mqtt.endpoint}/${var.image_repository}@${var.frontend_digest}"
}

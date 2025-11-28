terraform {
  required_version = ">= 1.6.0"
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.4"
    }
  }
}

# Crea un archivo local como demostración
resource "local_file" "hello" {
  content  = "Hola desde Terraform usando la extensión Help Deploy!"
  filename = "${path.module}/hello.txt"
}

output "hello_path" {
  value = local_file.hello.filename
}

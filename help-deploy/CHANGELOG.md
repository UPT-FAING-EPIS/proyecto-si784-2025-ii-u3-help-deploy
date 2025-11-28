# Change Log

## 1.0.6 - 2025-11-18

### Mejorado
- README actualizado con los nuevos comandos y orden solicitado.
- Detalles de extensión ajustados para cubrir funciones de Git y Terraform.

## 1.0.7 - 2025-11-18

### Añadido
- Icono en barra lateral con vista de Historial de ejecuciones del asistente.

## 1.0.8 - 2025-11-18

### Mejorado
- Botón de limpiar historial en la vista.
- Acción de copiar detalles desde el menú contextual de cada entrada.

## 1.0.9 - 2025-11-18

### Cambiado
- Icono del contenedor de Historial en la barra lateral actualizado a `images/btnHistorial(2).png`.

## 1.0.5 - 2025-11-18

### Añadido
- Guardado temporal (stash) con nombre y recuperación interactiva.
- Plantilla de documentación: crea README.md con secciones estándar.

## 1.0.4 - 2025-11-18

### Añadido
- Comando: Crear rama (Git) `help-deploy.gitCreateBranch` para crear y publicar
  nuevas ramas con sugerencia de base.

## 1.0.3 - 2025-11-18

### Mejorado
- `Pushear cambios (Git)` integra un wizard de Conventional Commits
  para generar mensajes tipo `feat(scope): description` antes del push.

## 1.0.2 - 2025-11-18

### Añadido
- Actualización automática de `.gitignore` tras `terraform apply` para excluir artefactos
  de Terraform y evitar problemas al hacer `git push`.

## 1.0.6 - 2025-11-18

### Corregido
- `Recuperar stash (Git)` ahora cita refs como `"stash@{0}"` para evitar
  errores de PowerShell con `{}`.

## 1.0.5 - 2025-11-18

### Añadido
- Asistente de Conventional Commits `help-deploy.gitSmartCommit`.
- Limpieza de ramas `help-deploy.gitCleanBranches`.
- Guardado temporal con stash `help-deploy.gitStashAssistant` y recuperación `help-deploy.gitStashRecover`.

## 1.0.4 - 2025-11-18

### Mejorado
- El asistente de despliegue muestra el resumen del `terraform plan` (recursos y totales) antes de aplicar.

## 1.0.3 - 2025-11-18

### Añadido
- Comando: Crear rama (Git) `help-deploy.gitCreateBranch` con sugerencia de rama base.

## 1.0.2 - 2025-11-15

### Añadido
- Creación/actualización automática de `.gitignore` tras aplicar despliegue con el asistente.
  Evita versionar `.terraform/`, estados y archivos temporales.

## 1.0.1 - 2025-11-15

### Añadido
- Comando: Clonar repositorio (Git) `help-deploy.gitClone`.
- Comando: Pushear cambios (Git) `help-deploy.gitPush`.

### Mejorado
- Detección automática de rama actual para prellenar en push.

## 0.0.5 - 2025-11-15

### Cambiado
- Títulos de comandos sin duplicar categoría: ahora `Crear main.tf` y `Desplegar proyecto con Terraform`.

## 0.0.4 - 2025-11-15

### Cambiado
- Eliminados `activationEvents` redundantes; activación basada en `contributes.commands`.
- Preparado paquete de distribución `.vsix` para publicación.

## 0.0.3 - 2025-11-14

### Añadido
- Nuevo comando: `Asistente: Crear main.tf` (`help-deploy.crearMainTf`) con plantillas para AWS, Azure, GCP y genérico.
- Selector de carpeta para `main.tf` y ajuste automático del directorio de trabajo del terminal.

### Cambiado
- Documentación actualizada para reflejar el nuevo flujo y comando.

## 0.0.2 - 2025-11-14

Mantenimiento y actualización de documentación.

## 0.0.1 - 2025-11-14

### Añadido
- Comando principal de despliegue: `Asistente: Desplegar proyecto con Terraform`.
- Ejecución automática de `terraform init`, `terraform plan` y confirmación modal para `terraform apply`.

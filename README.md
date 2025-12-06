[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/snLgAm1v)
[![Open in Codespaces](https://classroom.github.com/assets/launch-codespace-2972f46106e565e64193e422d61a12cf1da4916b45550586e14ef0a7c637dd04.svg)](https://classroom.github.com/open-in-codespaces?assignment_repo_id=21871155)

# Help Deploy

Asistente para Terraform y Git desde Visual Studio Code: clonar repos, crear ramas, plantilla README, commits guiados, stash y despliegues con Terraform.

## Integrantes

- Augusto Joaquín Rivera Muñoz (`2022073505`)
- Jefferson Rosas Chambilla (`2021072618`)

## Repositorio del proyeto completo (Drive)

https://drive.google.com/drive/folders/1yfMhP0oLkHyY8XGA6vY_prPZc8mB2aFJ?usp=sharing

## Instalación y ejecución

- Requisitos previos: `Node.js` 18+, `npm`, `git`, `terraform` en el `PATH`.
- Instalar dependencias: `npm install`.
- Compilar en desarrollo: `npm run compile`.
- Iniciar en un VS Code Extension Development Host: presiona `F5` desde VS Code.
- Ejecutar pruebas: `npm run test`.
- Lint y tipos: `npm run lint` y `npm run check-types`.

## Comandos

- Clonar repositorio (Git): `help-deploy.gitClone`
- Crear rama (Git): `help-deploy.gitCreateBranch`
- Crear README.md (Plantilla): `help-deploy.createReadme`
- Crear main.tf: `help-deploy.crearMainTf`
- Desplegar proyecto con Terraform: `help-deploy.desplegarTerraform`
- Pushear cambios (Git) con wizard de commits: `help-deploy.gitPush`
- Guardado temporal (stash) (Git): `help-deploy.gitStashAssistant`
- Recuperar stash (Git): `help-deploy.gitStashRecover`

## Requisitos

- Tener [Terraform](https://www.terraform.io/) instalado y en el `PATH` (`terraform -v`).
- Credenciales/configuración del proveedor si usas `plan`/`apply`.
- Tener `git` disponible en el `PATH` para los asistentes de Git.

## Uso rápido

- Terraform:
  - `Crear main.tf` para una plantilla básica.
  - `Desplegar proyecto con Terraform` ejecuta `init` → `plan` → confirmación → `apply`.
- Git:
  - `Clonar repositorio` para traer el repo.
  - `Crear rama` para crear y publicar una nueva rama.
  - `Pushear cambios` con wizard que genera mensajes `feat(scope): description`.
  - `Guardado temporal` crea un `stash` nombrado, `Recuperar stash` lo aplica o hace `pop`.

## Panel de historial

- Barra lateral: contenedor `Help Deploy` con vista `Historial`.
- Acciones: `Limpiar historial` y `Copiar detalles` en ítems del historial.

## Notas Técnicas

- Código en TypeScript y empaquetado con `esbuild` a `dist/extension.js`.
- Reutiliza terminales nombrados para Git y Terraform.

## Licencia

Consulta `LICENSE.txt` en el repositorio.

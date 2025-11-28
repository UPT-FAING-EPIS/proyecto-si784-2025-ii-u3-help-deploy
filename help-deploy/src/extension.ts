// API de VS Code
import * as vscode from 'vscode';
import { execFile } from 'child_process';

// Selecciona la carpeta de Terraform (donde está main.tf) y devuelve su URI
async function pickTerraformDir(): Promise<vscode.Uri | undefined> {
    const mainFiles = await vscode.workspace.findFiles('**/main.tf', '**/{node_modules,.git}/**', 50);

    if (mainFiles.length > 0) {
        const dirsMap = new Map<string, vscode.Uri>();
        for (const file of mainFiles) {
            const dir = vscode.Uri.joinPath(file, '..');
            if (!dirsMap.has(dir.fsPath)) {
                dirsMap.set(dir.fsPath, dir);
            }
        }

        const dirs = Array.from(dirsMap.values());
        if (dirs.length === 1) {
            return dirs[0];
        }

        const items = dirs.map((dir) => ({
            label: vscode.workspace.asRelativePath(dir, false),
            dir,
        }));

        const picked = await vscode.window.showQuickPick(items, {
            title: 'Selecciona la carpeta que contiene main.tf',
            placeHolder: 'Elige la carpeta de configuración de Terraform',
        });
        return picked?.dir;
    }

    const choose = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: 'Selecciona la carpeta que contiene main.tf',
    });
    return choose?.[0];
}

function quotePath(p: string): string {
    return `"${p.replace(/"/g, '\\"')}"`;
}

function isValidAwsRoleArn(arn: string): boolean {
    return /^arn:aws:iam::\d{12}:role\/[\w+=,.@\-_/]+$/.test(arn.trim());
}

async function pickDir(title: string): Promise<vscode.Uri | undefined> {
    const choose = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title,
    });
    return choose?.[0];
}

function getGitTerminal(cwd?: vscode.Uri | string): vscode.Terminal {
    const name = 'Git';
    const existing = vscode.window.terminals.find(t => t.name === name);
    if (existing) {
        if (cwd) {
            const path = typeof cwd === 'string' ? cwd : cwd.fsPath;
            existing.sendText(`cd ${quotePath(path)}`, true);
        }
        return existing;
    }
    const options: vscode.TerminalOptions = { name };
    if (cwd) {
        options.cwd = cwd;
    }
    return vscode.window.createTerminal(options);
}

async function ensureGitignoreTerraform(dir: vscode.Uri) {
    const fileUri = vscode.Uri.joinPath(dir, '.gitignore');
    let existing = '';
    try {
        const buf = await vscode.workspace.fs.readFile(fileUri);
        existing = Buffer.from(buf).toString('utf8');
    } catch {}
    const current = new Set(existing.split(/\r?\n/).map(l => l.trim()));
    const desired = [
        '.terraform/',
        'terraform.tfstate',
        'terraform.tfstate.backup',
        'crash.log',
        'crash.*.log',
        'terraform.tfvars',
        'terraform.tfvars.json',
        'override.tf',
        'override.tf.json',
        '*_override.tf',
        '*_override.tf.json',
        '.terraformrc',
        'terraform.rc',
    ];
    const toAdd = desired.filter(line => line && !current.has(line));
    if (toAdd.length === 0) {
        return;
    }
    const needsNl = existing.length > 0 && !existing.endsWith('\n');
    const out = (existing || '') + (needsNl ? '\n' : '') + toAdd.join('\n') + '\n';
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(out, 'utf8'));
}

type HistoryEntry = { label: string; detail?: string; time: number };
class HistoryProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private emitter = new vscode.EventEmitter<void>();
    onDidChangeTreeData = this.emitter.event;
    constructor(private entries: () => HistoryEntry[]) {}
    refresh() { this.emitter.fire(); }
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }
    getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
        const items = this.entries().map(e => {
            const item = new vscode.TreeItem(e.label);
            item.description = new Date(e.time).toLocaleString();
            item.tooltip = e.detail ? `${e.label}\n${e.detail}\n${new Date(e.time).toLocaleString()}` : `${e.label}\n${new Date(e.time).toLocaleString()}`;
            item.contextValue = 'historyItem';
            item.id = String(e.time);
            return item;
        });
        return items;
    }
}
class HistoryStore {
    private key = 'help-deploy.history';
    private cache: HistoryEntry[] = [];
    constructor(private ctx: vscode.ExtensionContext) {
        this.cache = (this.ctx.globalState.get(this.key) as HistoryEntry[] | undefined) || [];
    }
    list(): HistoryEntry[] { return this.cache; }
    add(label: string, detail?: string) {
        this.cache.unshift({ label, detail, time: Date.now() });
        this.cache = this.cache.slice(0, 100);
        this.ctx.globalState.update(this.key, this.cache);
    }
    clear() {
        this.cache = [];
        this.ctx.globalState.update(this.key, this.cache);
    }
}
let historyStore: HistoryStore | undefined;
let historyProvider: HistoryProvider | undefined;
function historyAdd(label: string, detail?: string) {
    if (!historyStore || !historyProvider) { return; }
    historyStore.add(label, detail);
    historyProvider.refresh();
}

// Construye una plantilla básica de main.tf según el proveedor
function buildMainTfTemplate(
    provider: 'aws' | 'azure' | 'gcp' | 'generic',
    opts: { region?: string; project?: string; roleArn?: string; bucketPrefix?: string } = {}
): string {
    const awsRegion = opts.region || 'us-east-1';
    const azureLocation = opts.region || 'eastus';
    const gcpRegion = opts.region || 'us-central1';
    const gcpProject = opts.project || 'your-project-id';

    switch (provider) {
        case 'aws':
            return `terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "aws" {
  region = var.aws_region
  ${opts.roleArn ? `assume_role {\n    role_arn = "${opts.roleArn}"\n  }` : ``}
}

variable "aws_region" {
  type    = string
  default = "${awsRegion}"
}

resource "random_string" "suffix" {
  length  = 6
  upper   = false
  special = false
}

resource "aws_s3_bucket" "demo" {
  bucket = "${opts.bucketPrefix || 'help-deploy-demo'}-\${random_string.suffix.result}"

  tags = {
    Project = "help-deploy"
    Env     = "demo"
  }
}
`;
        case 'azure':
            return `terraform {
  required_version = ">= 1.6.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {}
}

variable "location" {
  type    = string
  default = "${azureLocation}"
}
`;
        case 'gcp':
            return `terraform {
  required_version = ">= 1.6.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project
  region  = var.region
}

variable "project" {
  type = string
  default = "${gcpProject}"
}

variable "region" {
  type    = string
  default = "${gcpRegion}"
}
`;
        default:
            return `terraform {
  required_version = ">= 1.6.0"
}
`;
    }
}

// Selector simple de carpeta para crear archivos (siempre permite elegir cualquier carpeta)
async function pickDirForCreate(): Promise<vscode.Uri | undefined> {
    const choose = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: 'Selecciona la carpeta donde se creará main.tf',
    });
    return choose?.[0];
}

/**
 * Obtiene o crea un Terminal denominado "Terraform".
 * Si ya existe, se reutiliza; de lo contrario se crea uno nuevo.
 */
function getTerraformTerminal(cwd?: vscode.Uri | string): vscode.Terminal {
    const name = 'Terraform';
    const existing = vscode.window.terminals.find(t => t.name === name);
    if (existing) {
        // Si se indicó un cwd, ajusta con un cd
        if (cwd) {
            const path = typeof cwd === 'string' ? cwd : cwd.fsPath;
            existing.sendText(`cd ${quotePath(path)}`, true);
        }
        return existing;
    }
    const options: vscode.TerminalOptions = { name };
    if (cwd) {
        options.cwd = cwd;
    }
    return vscode.window.createTerminal(options);
}

// v1.0.1 no incluye resumen capturado de terraform plan

/**
 * Activación de la extensión. Se registra el comando principal.
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('La extensión "help-deploy" está activa.');
    historyStore = new HistoryStore(context);
    historyProvider = new HistoryProvider(() => historyStore!.list());
    vscode.window.registerTreeDataProvider('helpDeployHistoryView', historyProvider);
    const clearHistory = vscode.commands.registerCommand('help-deploy.history.clear', async () => {
        if (!historyStore || !historyProvider) { return; }
        historyStore.clear();
        historyProvider.refresh();
        vscode.window.showInformationMessage('Historial limpiado');
    });
    const copyHistoryEntry = vscode.commands.registerCommand('help-deploy.history.copyEntry', async (node: vscode.TreeItem) => {
        if (!historyStore) { return; }
        const id = String(node.id || '');
        const entry = historyStore.list().find(e => String(e.time) === id);
        const label = typeof node.label === 'string' ? node.label : node.label?.label || '';
        const detail = entry?.detail || '';
        const when = new Date(entry?.time || Date.now()).toLocaleString();
        const text = [label, detail, when].filter(Boolean).join('\n');
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage('Detalles copiados al portapapeles');
    });
    context.subscriptions.push(clearHistory, copyHistoryEntry);

    // Registrar el comando principal del asistente
    const disposable = vscode.commands.registerCommand('help-deploy.desplegarTerraform', async () => {
        try {
            // Paso 1: Seleccionar la carpeta que contiene (o contendrá) main.tf
            const configDir = await pickTerraformDir();
            if (!configDir) {
                vscode.window.showErrorMessage('No se encontró ni seleccionó carpeta para main.tf.');
                return;
            }
            historyAdd('Desplegar proyecto con Terraform', vscode.workspace.asRelativePath(configDir, false));

            // Paso 1.1: Si no existe main.tf en la carpeta, ofrecer crearlo aquí mismo
            const mainUri = vscode.Uri.joinPath(configDir, 'main.tf');
            let hasMain = true;
            try {
                await vscode.workspace.fs.stat(mainUri);
            } catch {
                hasMain = false;
            }

            if (!hasMain) {
                const createNow = await vscode.window.showInformationMessage(
                    'No se encontró main.tf en la carpeta seleccionada. ¿Deseas generarlo ahora?',
                    { modal: true },
                    'Sí',
                    'No'
                );
                if (createNow !== 'Sí') {
                    vscode.window.showWarningMessage('Sin main.tf no se puede ejecutar Terraform. Operación cancelada.');
                    return;
                }

                const providerPick = await vscode.window.showQuickPick(
                    [
                        { label: 'AWS', value: 'aws' as const },
                        { label: 'Azure', value: 'azure' as const },
                        { label: 'GCP', value: 'gcp' as const },
                        { label: 'Genérico', value: 'generic' as const },
                    ],
                    {
                        title: 'Selecciona el proveedor para la plantilla de main.tf',
                        placeHolder: 'AWS, Azure, GCP o Genérico',
                    }
                );
                if (!providerPick) {
                    vscode.window.showWarningMessage('No se seleccionó proveedor. Operación cancelada.');
                    return;
                }

                // Solicitar parámetros según proveedor
                let region: string | undefined;
                let project: string | undefined;
                let roleArn: string | undefined;
                let bucketPrefix: string | undefined;
                if (providerPick.value === 'aws') {
                    region = await vscode.window.showInputBox({
                        title: 'Región AWS',
                        placeHolder: 'us-east-2',
                        value: 'us-east-2',
                    }) || undefined;
                    roleArn = await vscode.window.showInputBox({
                        title: 'Role ARN (opcional)',
                        placeHolder: 'arn:aws:iam::123456789012:role/YourRole',
                        prompt: 'Indica el ARN del rol a asumir si aplica',
                    }) || undefined;
                    if (roleArn && !isValidAwsRoleArn(roleArn)) {
                        vscode.window.showWarningMessage('El ARN indicado no corresponde a un Role IAM válido. Se omitirá assume_role.');
                        roleArn = undefined;
                    }
                    bucketPrefix = await vscode.window.showInputBox({
                        title: 'Prefijo de bucket S3',
                        placeHolder: 'help-deploy-demo',
                        value: 'help-deploy-demo',
                        prompt: 'Prefijo para crear un bucket único (se añade sufijo aleatorio)',
                    }) || 'help-deploy-demo';
                } else if (providerPick.value === 'azure') {
                    region = await vscode.window.showInputBox({
                        title: 'Ubicación Azure',
                        placeHolder: 'eastus',
                        value: 'eastus',
                    }) || undefined;
                } else if (providerPick.value === 'gcp') {
                    project = await vscode.window.showInputBox({
                        title: 'Proyecto GCP',
                        placeHolder: 'your-project-id',
                    }) || undefined;
                    region = await vscode.window.showInputBox({
                        title: 'Región GCP',
                        placeHolder: 'us-central1',
                        value: 'us-central1',
                    }) || undefined;
                }

                const content = buildMainTfTemplate(providerPick.value, { region, project, roleArn, bucketPrefix });
                await vscode.workspace.fs.writeFile(mainUri, Buffer.from(content, 'utf8'));
                const doc = await vscode.workspace.openTextDocument(mainUri);
                await vscode.window.showTextDocument(doc);
                vscode.window.showInformationMessage('main.tf generado. Continuando con el despliegue...');
            }

            // Paso 2: Crear o reutilizar el Terminal "Terraform" con el cwd correcto
            const terminal = getTerraformTerminal(configDir);

            // Paso 3: Mostrar el terminal al usuario
            terminal.show();

            // Paso 3.1: Configurar credenciales AWS si el proyecto es de AWS
            const wantsAws = await vscode.window.showQuickPick(['Sí', 'No'], {
                title: '¿Este proyecto usa AWS y necesitas configurar credenciales ahora?',
                placeHolder: 'Selecciona Sí para configurar AWS_ACCESS_KEY_ID/SECRET/TOKEN/REGION',
                ignoreFocusOut: true,
            });
            if (wantsAws === 'Sí') {
                const accessKey = await vscode.window.showInputBox({
                    title: 'AWS_ACCESS_KEY_ID',
                    placeHolder: 'clave de acceso',
                    prompt: 'Introduce tu AWS Access Key ID',
                    ignoreFocusOut: true,
                });
                const secretKey = await vscode.window.showInputBox({
                    title: 'AWS_SECRET_ACCESS_KEY',
                    placeHolder: 'secreto de acceso',
                    prompt: 'Introduce tu AWS Secret Access Key',
                    password: true,
                    ignoreFocusOut: true,
                });
                const sessionToken = await vscode.window.showInputBox({
                    title: 'AWS_SESSION_TOKEN (opcional)',
                    placeHolder: 'token temporal si aplica',
                    prompt: 'Introduce tu AWS Session Token si es temporal',
                    password: true,
                    ignoreFocusOut: true,
                });
                const region = await vscode.window.showInputBox({
                    title: 'AWS_REGION',
                    placeHolder: 'us-east-2',
                    value: 'us-east-2',
                    prompt: 'Región por defecto para el despliegue',
                    ignoreFocusOut: true,
                });

                if (!accessKey || !secretKey) {
                    vscode.window.showWarningMessage('Credenciales AWS incompletas. Se continuará sin configurarlas.');
                } else {
                    // Configura variables de entorno en la sesión del terminal (PowerShell)
                    terminal.sendText(`$env:AWS_ACCESS_KEY_ID=${quotePath(accessKey)}`, true);
                    terminal.sendText(`$env:AWS_SECRET_ACCESS_KEY=${quotePath(secretKey)}`, true);
                    if (sessionToken) {
                        terminal.sendText(`$env:AWS_SESSION_TOKEN=${quotePath(sessionToken)}`, true);
                    }
                    if (region) {
                        terminal.sendText(`$env:AWS_DEFAULT_REGION=${quotePath(region)}`, true);
                        terminal.sendText(`$env:AWS_REGION=${quotePath(region)}`, true);
                    }
                    vscode.window.showInformationMessage('Credenciales AWS configuradas para esta sesión.');
                }
            }

            // Paso 4: Ejecutar "terraform init"
            terminal.sendText('terraform init', true);

            // Paso 5: Ejecutar inmediatamente "terraform plan" en el terminal
            terminal.sendText('terraform plan', true);

            // Paso 6: Mostrar confirmación modal para aplicar los cambios
            const respuesta = await vscode.window.showInformationMessage(
                "Terraform 'plan' finalizado. ¿Deseas aplicar los cambios?",
                { modal: true },
                'Sí',
                'No'
            );

            // Paso 7: Si el usuario confirma, aplicar los cambios
            if (respuesta === 'Sí') {
                terminal.sendText('terraform apply -auto-approve', true);
                vscode.window.showInformationMessage('Despliegue iniciado');
                try {
                    await ensureGitignoreTerraform(configDir);
                    vscode.window.showInformationMessage('.gitignore actualizado para Terraform');
                } catch {}
            } else {
                // Paso 8: Si el usuario cancela o elige 'No'
                vscode.window.showInformationMessage('Despliegue cancelado por el usuario');
            }
        } catch (error) {
            // Manejo básico de errores
            console.error('Error en el asistente de Terraform:', error);
            vscode.window.showErrorMessage('Ocurrió un error al ejecutar el asistente de Terraform. Revisa la consola de desarrollo para más detalles.');
        }
    });

    context.subscriptions.push(disposable);

    // Registrar el comando para crear un main.tf básico
    const createMainTf = vscode.commands.registerCommand('help-deploy.crearMainTf', async () => {
        try {
            // Elegir proveedor
            const providerPick = await vscode.window.showQuickPick(
                [
                    { label: 'AWS', value: 'aws' as const },
                    { label: 'Azure', value: 'azure' as const },
                    { label: 'GCP', value: 'gcp' as const },
                    { label: 'Genérico', value: 'generic' as const },
                ],
                {
                    title: 'Selecciona el proveedor para la plantilla de main.tf',
                    placeHolder: 'AWS, Azure, GCP o Genérico',
                }
            );
            if (!providerPick) {
                return;
            }
            historyAdd('Crear main.tf', providerPick.label);

            // Opcional: pedir región/proyecto según proveedor
            let region: string | undefined;
            let project: string | undefined;
            let roleArn: string | undefined;
            let bucketPrefix: string | undefined;
            if (providerPick.value === 'aws') {
                region = await vscode.window.showInputBox({
                    title: 'Región AWS',
                    placeHolder: 'us-east-2',
                    value: 'us-east-2',
                }) || undefined;
                roleArn = await vscode.window.showInputBox({
                    title: 'Role ARN (opcional)',
                    placeHolder: 'arn:aws:iam::459194790413:role/LabRole',
                    prompt: 'Indica el ARN del rol a asumir si aplica',
                }) || undefined;
                if (roleArn && !isValidAwsRoleArn(roleArn)) {
                    vscode.window.showWarningMessage('El ARN indicado no corresponde a un Role IAM válido. Se omitirá assume_role.');
                    roleArn = undefined;
                }
                bucketPrefix = await vscode.window.showInputBox({
                    title: 'Prefijo de bucket S3',
                    placeHolder: 'help-deploy-demo',
                    value: 'help-deploy-demo',
                    prompt: 'Prefijo para crear un bucket único (se añade sufijo aleatorio)',
                }) || 'help-deploy-demo';
            } else if (providerPick.value === 'azure') {
                region = await vscode.window.showInputBox({
                    title: 'Ubicación Azure',
                    placeHolder: 'eastus',
                    value: 'eastus',
                }) || undefined;
            } else if (providerPick.value === 'gcp') {
                project = await vscode.window.showInputBox({
                    title: 'Proyecto GCP',
                    placeHolder: 'your-project-id',
                }) || undefined;
                region = await vscode.window.showInputBox({
                    title: 'Región GCP',
                    placeHolder: 'us-central1',
                    value: 'us-central1',
                }) || undefined;
            }

            const content = buildMainTfTemplate(providerPick.value, { region, project, roleArn, bucketPrefix });

            // Elegir carpeta para crear main.tf
            const targetDir = await pickDirForCreate();
            if (!targetDir) {
                vscode.window.showErrorMessage('No se seleccionó una carpeta destino.');
                return;
            }
            const mainUri = vscode.Uri.joinPath(targetDir, 'main.tf');

            // Si ya existe, confirmar sobrescritura
            let exists = false;
            try {
                await vscode.workspace.fs.stat(mainUri);
                exists = true;
            } catch {
                exists = false;
            }
            if (exists) {
                const r = await vscode.window.showInformationMessage(
                    'main.tf ya existe en la carpeta seleccionada. ¿Deseas sobrescribirlo?',
                    { modal: true },
                    'Sí',
                    'No'
                );
                if (r !== 'Sí') {
                    return;
                }
            }

            await vscode.workspace.fs.writeFile(mainUri, Buffer.from(content, 'utf8'));
            vscode.window.showInformationMessage(`main.tf creado en ${vscode.workspace.asRelativePath(mainUri, false)}`);
            const doc = await vscode.workspace.openTextDocument(mainUri);
            await vscode.window.showTextDocument(doc);
        } catch (error) {
            console.error('Error al crear main.tf:', error);
            vscode.window.showErrorMessage('Ocurrió un error al crear main.tf. Revisa la consola de desarrollo para más detalles.');
        }
    });
    context.subscriptions.push(createMainTf);

    const gitClone = vscode.commands.registerCommand('help-deploy.gitClone', async () => {
        try {
            const url = await vscode.window.showInputBox({
                title: 'URL del repositorio (git clone)',
                placeHolder: 'https://github.com/usuario/repo.git',
                validateInput: (v) => v.trim() ? undefined : 'Ingresa una URL válida',
            });
            if (!url) {
                return;
            }
            historyAdd('Clonar repositorio (Git)', url);
            let target = vscode.workspace.workspaceFolders?.[0]?.uri;
            if (!target) {
                target = await pickDir('Selecciona la carpeta destino para git clone');
            }
            if (!target) {
                vscode.window.showErrorMessage('No se seleccionó carpeta destino.');
                return;
            }
            const term = getGitTerminal(target);
            term.show();
            term.sendText(`git clone ${quotePath(url)}`, true);
            vscode.window.showInformationMessage('Ejecutando git clone en el terminal Git.');
        } catch (e) {
            console.error(e);
            vscode.window.showErrorMessage('Error al ejecutar git clone.');
        }
    });
    context.subscriptions.push(gitClone);

    const gitPush = vscode.commands.registerCommand('help-deploy.gitPush', async () => {
        try {
            let repo = vscode.window.activeTextEditor?.document.uri;
            if (!repo && vscode.workspace.workspaceFolders?.length) {
                repo = vscode.workspace.workspaceFolders[0].uri;
            }
            if (!repo) {
                repo = await pickDir('Selecciona la carpeta del repositorio para hacer push');
            }
            if (!repo) {
                vscode.window.showErrorMessage('No se seleccionó carpeta de repositorio.');
                return;
            }
            const repoPath = repo.fsPath;
            const branchDetect = await new Promise<string | undefined>((resolve) => {
                try {
                    execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath }, (err, stdout) => {
                        if (err) { resolve(undefined); return; }
                        const out = String(stdout || '').trim();
                        resolve(out || undefined);
                    });
                } catch {
                    resolve(undefined);
                }
            });
            const type = await vscode.window.showQuickPick(['feat', 'fix', 'docs', 'style', 'refactor'], { title: 'Tipo de commit', ignoreFocusOut: true });
            if (!type) { return; }
            const scope = await vscode.window.showInputBox({ title: 'Ámbito (opcional)', placeHolder: 'login, terraform' });
            const description = await vscode.window.showInputBox({ title: 'Descripción corta', validateInput: (v) => v.trim() ? undefined : 'La descripción no puede estar vacía' });
            if (!description) { return; }
            const message = (scope && scope.trim()) ? `${type}(${scope.trim()}): ${description.trim()}` : `${type}: ${description.trim()}`;
            historyAdd('Pushear cambios (Git)', message);
            const branch = await vscode.window.showInputBox({
                title: 'Rama de destino',
                placeHolder: branchDetect || 'main',
                value: branchDetect || 'main',
                validateInput: (v) => v.trim() ? undefined : 'La rama no puede estar vacía',
            });
            if (!branch) {
                return;
            }
            const term = getGitTerminal(repo);
            term.show();
            const msgQuoted = `-m ${quotePath(message)}`;
            term.sendText('git add .', true);
            term.sendText(`git commit ${msgQuoted}`, true);
            term.sendText(`git push origin ${branch}`, true);
            vscode.window.showInformationMessage('Ejecutando git add/commit/push en el terminal Git.');
        } catch (e) {
            console.error(e);
            vscode.window.showErrorMessage('Error al ejecutar git push.');
        }
    });
    context.subscriptions.push(gitPush);

    const gitCreateBranch = vscode.commands.registerCommand('help-deploy.gitCreateBranch', async () => {
        try {
            let repo = vscode.window.activeTextEditor?.document.uri;
            if (!repo && vscode.workspace.workspaceFolders?.length) {
                repo = vscode.workspace.workspaceFolders[0].uri;
            }
            if (!repo) {
                repo = await pickDir('Selecciona la carpeta del repositorio para crear la rama');
            }
            if (!repo) {
                vscode.window.showErrorMessage('No se seleccionó carpeta de repositorio.');
                return;
            }
            const repoPath = repo.fsPath;
            const currentBranch = await new Promise<string | undefined>((resolve) => {
                try {
                    execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath }, (err, stdout) => {
                        if (err) { resolve(undefined); return; }
                        const out = String(stdout || '').trim();
                        resolve(out || undefined);
                    });
                } catch {
                    resolve(undefined);
                }
            });
            const newBranch = await vscode.window.showInputBox({
                title: 'Nombre de la nueva rama',
                placeHolder: 'feature/nueva-funcionalidad',
                validateInput: (v) => v.trim() ? undefined : 'El nombre de rama no puede estar vacío',
            });
            if (!newBranch) {
                return;
            }
            historyAdd('Crear rama (Git)', newBranch);
            const baseBranch = await vscode.window.showInputBox({
                title: 'Rama base (opcional)',
                placeHolder: currentBranch || 'main',
                value: currentBranch || 'main',
            });
            const term = getGitTerminal(repo);
            term.show();
            term.sendText('git fetch origin', true);
            if (baseBranch && baseBranch.trim()) {
                term.sendText(`git checkout -b ${quotePath(newBranch)} ${quotePath(baseBranch)}`, true);
            } else {
                term.sendText(`git checkout -b ${quotePath(newBranch)}`, true);
            }
            term.sendText(`git push --set-upstream origin ${quotePath(newBranch)}`, true);
            vscode.window.showInformationMessage(`Creación y publicación de la rama '${newBranch}' iniciadas en el terminal Git.`);
        } catch (e) {
            console.error(e);
            vscode.window.showErrorMessage('Error al crear la rama.');
        }
    });
    context.subscriptions.push(gitCreateBranch);

    const gitStashAssistant = vscode.commands.registerCommand('help-deploy.gitStashAssistant', async () => {
        try {
            let repo = vscode.window.activeTextEditor?.document.uri;
            if (!repo && vscode.workspace.workspaceFolders?.length) {
                repo = vscode.workspace.workspaceFolders[0].uri;
            }
            if (!repo) {
                repo = await pickDir('Selecciona la carpeta del repositorio para guardar el stash');
            }
            if (!repo) {
                vscode.window.showErrorMessage('No se seleccionó carpeta de repositorio.');
                return;
            }
            const name = await vscode.window.showInputBox({ title: 'Nombre del stash', placeHolder: 'trabajo en login' });
            if (!name) { return; }
            historyAdd('Guardado temporal (stash) (Git)', name);
            const term = getGitTerminal(repo);
            term.show();
            term.sendText(`git stash save ${quotePath(name)}`, true);
            vscode.window.showInformationMessage('Stash guardado en el terminal Git.');
        } catch (e) {
            console.error(e);
            vscode.window.showErrorMessage('Error al crear el stash.');
        }
    });
    context.subscriptions.push(gitStashAssistant);

    const gitStashRecover = vscode.commands.registerCommand('help-deploy.gitStashRecover', async () => {
        try {
            let repo = vscode.window.activeTextEditor?.document.uri;
            if (!repo && vscode.workspace.workspaceFolders?.length) {
                repo = vscode.workspace.workspaceFolders[0].uri;
            }
            if (!repo) {
                repo = await pickDir('Selecciona la carpeta del repositorio para recuperar el stash');
            }
            if (!repo) {
                vscode.window.showErrorMessage('No se seleccionó carpeta de repositorio.');
                return;
            }
            const cwd = repo.fsPath;
            const stashText = await new Promise<string | undefined>((resolve) => {
                try {
                    execFile('git', ['stash', 'list'], { cwd }, (err, stdout) => {
                        if (err) { resolve(undefined); return; }
                        resolve(String(stdout || ''));
                    });
                } catch { resolve(undefined); }
            });
            const items = (stashText || '')
                .split(/\r?\n/)
                .map(l => l.trim())
                .filter(l => !!l);
            if (!items.length) {
                vscode.window.showInformationMessage('No hay stashes disponibles para recuperar.');
                return;
            }
            const selected = await vscode.window.showQuickPick(items, { title: 'Selecciona el stash a recuperar' });
            if (!selected) { return; }
            historyAdd('Recuperar stash (Git)', selected);
            const action = await vscode.window.showQuickPick(['apply', 'pop'], { title: 'Acción sobre el stash' });
            if (!action) { return; }
            const ref = selected.split(':')[0];
            const term = getGitTerminal(repo);
            term.show();
            term.sendText(`git stash ${action} ${quotePath(ref)}`, true);
            vscode.window.showInformationMessage(`Operación de stash '${action}' iniciada en el terminal Git.`);
        } catch (e) {
            console.error(e);
            vscode.window.showErrorMessage('Error al recuperar el stash.');
        }
    });
    context.subscriptions.push(gitStashRecover);

    const createReadme = vscode.commands.registerCommand('help-deploy.createReadme', async () => {
        try {
            let target = vscode.workspace.workspaceFolders?.[0]?.uri;
            if (!target) {
                target = await pickDir('Selecciona la carpeta donde crear README.md');
            }
            if (!target) {
                vscode.window.showErrorMessage('No se seleccionó carpeta destino.');
                return;
            }
            const title = await vscode.window.showInputBox({ title: 'Título del proyecto', placeHolder: 'Nombre del proyecto' });
            const description = await vscode.window.showInputBox({ title: 'Descripción breve', placeHolder: 'Describe el objetivo del proyecto' });
            historyAdd('Crear README.md (Plantilla)', title || 'Título');
            const readmeUri = vscode.Uri.joinPath(target, 'README.md');
            const content = `# ${title || 'Título'}\n\n## Descripción\n${description || 'Descripción'}\n\n## Cómo instalar\n\n1. Clona el repositorio\n2. Instala dependencias\n\n## Cómo desplegar\n\n1. Configura credenciales\n2. Ejecuta el asistente de Terraform`;
            await vscode.workspace.fs.writeFile(readmeUri, Buffer.from(content, 'utf8'));
            const doc = await vscode.workspace.openTextDocument(readmeUri);
            await vscode.window.showTextDocument(doc);
            vscode.window.showInformationMessage('README.md creado con estructura estándar.');
        } catch (e) {
            console.error(e);
            vscode.window.showErrorMessage('Error al crear README.md.');
        }
    });
    context.subscriptions.push(createReadme);

    // v1.0.1 no incluye asistentes adicionales de Git (crear rama, commits, limpieza, stash)
}

/**
 * Desactivación de la extensión.
 */
export function deactivate() { /* no-op */ }

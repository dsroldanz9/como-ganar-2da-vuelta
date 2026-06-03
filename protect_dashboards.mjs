import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const protectedDir = path.join(root, "protected");
fs.mkdirSync(protectedDir, { recursive: true });

const iterations = 310000;
const privateAccessPath = path.join(root, "ACCESOS_TABLEROS_PRIVADO.txt");
const users = loadUsers(privateAccessPath);

const dashboards = [
  {
    id: "bogota",
    out: "bogota.bundle.json",
    globals: {
      BOGOTA_CAMPANA: readWindowAssignment("bogota-campana/data.js", "BOGOTA_CAMPANA"),
      BOGOTA_GEO: readWindowAssignment("bogota-campana/geo.js", "BOGOTA_GEO")
    },
    files: {
      BOGOTA_EXCEL_B64: fs.readFileSync(path.join(root, "bogota-campana/bogota_matriz_upz_mensajes.xlsx")).toString("base64")
    }
  }
];

const masterKeys = new Map();
for (const dashboard of dashboards) {
  const master = crypto.randomBytes(32);
  masterKeys.set(dashboard.id, master);
  const encrypted = encrypt(master, Buffer.from(JSON.stringify({
    globals: dashboard.globals,
    files: dashboard.files || {}
  }), "utf8"));
  fs.writeFileSync(path.join(protectedDir, dashboard.out), JSON.stringify({
    v: 1,
    crypto: "AES-256-GCM",
    ...encrypted
  }));
}

const usersJson = {
  v: 1,
  kdf: "PBKDF2-SHA256",
  iterations,
  users: users.map((u) => {
    const salt = crypto.randomBytes(16);
    const kek = crypto.pbkdf2Sync(u.password, salt, iterations, 32, "sha256");
    const keys = {};
    for (const dashboard of dashboards) {
      keys[dashboard.id] = encrypt(kek, masterKeys.get(dashboard.id));
    }
    return {
      user: u.user,
      salt: salt.toString("base64"),
      keys
    };
  })
};
fs.writeFileSync(path.join(protectedDir, "users.json"), JSON.stringify(usersJson));

const accessText = [
  "ACCESOS PRIVADOS - NO SUBIR A GIT",
  `Generado: ${new Date().toISOString()}`,
  "",
  "URL protegida: https://dsroldanz9.github.io/como-ganar-2da-vuelta/bogota-campana/",
  "",
  ...users.flatMap((u) => [`Usuario: ${u.user}`, `Clave: ${u.password}`, ""])
].join("\r\n");
fs.writeFileSync(privateAccessPath, accessText);

console.log(`Bundles cifrados escritos en ${protectedDir}`);
console.log("Accesos privados escritos en ACCESOS_TABLEROS_PRIVADO.txt");

function encrypt(key, plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    ciphertext: Buffer.concat([ciphertext, tag]).toString("base64")
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function readWindowAssignment(file, globalName) {
  const code = fs.readFileSync(path.join(root, file), "utf8");
  const context = { window: {} };
  vm.runInNewContext(code, context, { filename: file });
  if (!context.window[globalName]) throw new Error(`No se encontró window.${globalName} en ${file}`);
  return context.window[globalName];
}

function loadUsers(file) {
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, "utf8");
    const matches = [...text.matchAll(/Usuario:\s*(.+?)\r?\nClave:\s*(.+?)(?:\r?\n|$)/g)];
    if (matches.length) return matches.map((m) => ({ user: m[1].trim(), password: m[2].trim() }));
  }
  return [
    { user: "daniel" },
    { user: "equipo-territorial" },
    { user: "bogota" }
  ].map((u) => ({ ...u, password: crypto.randomBytes(14).toString("base64url") }));
}

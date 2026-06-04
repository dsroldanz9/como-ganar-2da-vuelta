(function () {
  const current = document.currentScript;
  const cfg = {
    title: current.dataset.title || "Tablero protegido",
    bundleId: current.dataset.bundleId,
    usersUrl: current.dataset.users,
    bundleUrl: current.dataset.bundle,
    bundleExtraUrl: current.dataset.bundleExtra,
    appUrl: current.dataset.app
  };

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  function makeShell() {
    const shell = document.createElement("div");
    shell.className = "auth-lock";
    shell.innerHTML = `
      <section class="auth-card" role="dialog" aria-modal="true" aria-label="Acceso protegido">
        <div class="auth-head">
          <p class="auth-kicker">Acceso cerrado</p>
          <h1>${escapeHtml(cfg.title)}</h1>
          <p>Este tablero usa datos estratégicos cifrados. Ingresa con usuario y clave autorizados para cargarlo.</p>
        </div>
        <form class="auth-form">
          <label>
            <span>Usuario</span>
            <input name="user" autocomplete="username" required autofocus>
          </label>
          <label>
            <span>Clave</span>
            <input name="pass" type="password" autocomplete="current-password" required>
          </label>
          <button type="submit">Abrir tablero</button>
          <p class="auth-error" aria-live="polite"></p>
        </form>
        <div class="auth-note">La información no se descarga en claro hasta que una clave válida la descifra en este navegador.</div>
      </section>
    `;
    document.body.appendChild(shell);
    return shell;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));
  }

  async function deriveKey(password, salt, iterations) {
    const material = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
  }

  async function aesDecrypt(key, payload) {
    const bytes = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBytes(payload.iv) },
      key,
      b64ToBytes(payload.ciphertext)
    );
    return new Uint8Array(bytes);
  }

  async function login(userName, password) {
    const [usersPayload, bundlePayload] = await Promise.all([
      fetch(cfg.usersUrl, { cache: "no-store" }).then((r) => r.json()),
      fetch(cfg.bundleUrl, { cache: "no-store" }).then((r) => r.json())
    ]);
    const user = usersPayload.users.find((u) => u.user.toLowerCase() === userName.toLowerCase());
    if (!user || !user.keys || !user.keys[cfg.bundleId]) throw new Error("Usuario o clave incorrectos.");

    const derived = await deriveKey(password, b64ToBytes(user.salt), usersPayload.iterations);
    const rawMaster = await aesDecrypt(derived, user.keys[cfg.bundleId]);
    const master = await crypto.subtle.importKey(
      "raw",
      rawMaster,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    const plain = await aesDecrypt(master, bundlePayload);
    const bundle = JSON.parse(dec.decode(plain));

    const applyBundle = (b) => {
      Object.entries(b.globals || {}).forEach(([name, value]) => {
        window[name] = value;
      });
      window.PROTECTED_FILES = Object.assign({}, window.PROTECTED_FILES || {}, b.files || {});
      Object.entries(b.files || {}).forEach(([name, value]) => {
        window[name] = value;
      });
    };
    applyBundle(bundle);

    if (cfg.bundleExtraUrl) {
      const extraPayload = await fetch(cfg.bundleExtraUrl, { cache: "no-store" }).then((r) => r.json());
      const extraPlain = await aesDecrypt(master, extraPayload);
      applyBundle(JSON.parse(dec.decode(extraPlain)));
    }

    const appScript = document.createElement("script");
    appScript.src = cfg.appUrl;
    document.body.appendChild(appScript);
  }

  const shell = makeShell();
  const form = shell.querySelector("form");
  const error = shell.querySelector(".auth-error");
  const button = shell.querySelector("button");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    shell.classList.add("auth-loading");
    button.disabled = true;
    button.textContent = "Descifrando...";
    try {
      await login(form.elements.user.value.trim(), form.elements.pass.value);
      shell.remove();
    } catch (err) {
      error.textContent = err.message || "No se pudo abrir el tablero.";
      button.disabled = false;
      button.textContent = "Abrir tablero";
      shell.classList.remove("auth-loading");
    }
  });
})();

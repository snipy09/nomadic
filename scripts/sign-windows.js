/**
 * Nomadic Windows Authenticode code-signing hook and CLI.
 *
 * Usage:
 *   1. electron-builder custom sign hook (`win.sign` in apps/desktop/package.json)
 *   2. Standalone: node scripts/sign-windows.js <path-to-exe>
 *
 * The certificate is NEVER stored in the repo. It is read from the environment:
 *   - WIN_CSC_LINK (or CSC_LINK): path to a .pfx file, or the .pfx as a base64 string
 *   - WIN_CSC_KEY_PASSWORD (or CSC_KEY_PASSWORD): password for the .pfx
 *   - WIN_CERT_THUMBPRINT: SHA-1 thumbprint of a cert in the Windows store / hardware token
 *
 * When none of these are set (or the cert cannot be found), signing is skipped with a
 * notice and the build continues unsigned. Set WIN_SIGN_REQUIRED=1 to make a missing or
 * failed signature a hard error instead (use this in release CI).
 *
 * Signatures are SHA-256 Authenticode with RFC-3161 timestamping.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const RFC3161_TIMESTAMP_SERVERS = [
  'http://timestamp.digicert.com',
  'http://timestamp.sectigo.com',
  'http://timestamp.comodoca.com',
  'http://tsa.starfieldtech.com',
];

const signingRequired = () => /^(1|true|yes)$/i.test(process.env.WIN_SIGN_REQUIRED || '');

function skip(message) {
  if (signingRequired()) {
    throw new Error(`[CodeSign] ${message} (WIN_SIGN_REQUIRED is set, refusing to continue unsigned)`);
  }
  console.log(`[CodeSign] ${message} Skipping signing.`);
}

function looksLikeBase64Pfx(value) {
  const trimmed = value.trim();
  return trimmed.length > 100 && /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed);
}

/**
 * electron-builder custom signing hook.
 */
export default async function customSign(configuration) {
  const filePath = configuration && configuration.path;
  if (!filePath || !fs.existsSync(filePath)) {
    console.warn(`[CodeSign] Target file does not exist: ${filePath}`);
    return;
  }

  const certLink = process.env.WIN_CSC_LINK || process.env.CSC_LINK || '';
  const certPassword = process.env.WIN_CSC_KEY_PASSWORD || process.env.CSC_KEY_PASSWORD || '';
  const certThumbprint = process.env.WIN_CERT_THUMBPRINT || '';

  if (!certLink && !certThumbprint) {
    skip('No certificate configured (set WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD, or WIN_CERT_THUMBPRINT).');
    return;
  }

  let tempCertPath = null;
  let certPath = null;

  try {
    if (certLink) {
      const resolved = path.resolve(certLink);
      if (fs.existsSync(resolved)) {
        certPath = resolved;
      } else if (looksLikeBase64Pfx(certLink)) {
        // Write the base64 cert to a private temp file that is removed in `finally`.
        tempCertPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nomadic-sign-')), 'cert.pfx');
        fs.writeFileSync(tempCertPath, Buffer.from(certLink.trim(), 'base64'), { mode: 0o600 });
        certPath = tempCertPath;
      } else if (!certThumbprint) {
        skip(`Certificate not found at WIN_CSC_LINK path "${certLink}".`);
        return;
      }
    }

    console.log(`[CodeSign] Signing ${path.basename(filePath)} (SHA-256 Authenticode, RFC-3161 timestamp)...`);

    let signed = false;

    // 1. signtool.exe (Windows SDK)
    for (const tsUrl of RFC3161_TIMESTAMP_SERVERS) {
      try {
        const args = ['sign', '/fd', 'sha256', '/tr', tsUrl, '/td', 'sha256'];
        if (certThumbprint) {
          args.push('/sha1', certThumbprint);
        } else if (certPath) {
          args.push('/f', certPath);
          if (certPassword) args.push('/p', certPassword);
        }
        args.push(filePath);

        execFileSync('signtool.exe', args, { stdio: 'pipe' });
        console.log(`[CodeSign] Signed ${path.basename(filePath)} via signtool.exe (timestamp: ${tsUrl})`);
        signed = true;
        break;
      } catch {
        // Try the next timestamp server, then fall back to PowerShell.
      }
    }

    // 2. PowerShell Set-AuthenticodeSignature. Secrets are passed through the child's
    //    environment, never on the command line, so they do not show up in process lists.
    if (!signed && certPath) {
      const psScript = [
        "$ErrorActionPreference = 'Stop'",
        '$pw = ConvertTo-SecureString -String $env:NOMADIC_SIGN_PFX_PASSWORD -Force -AsPlainText',
        '$flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable',
        '$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($env:NOMADIC_SIGN_PFX_PATH, $pw, $flags)',
        '$sig = Set-AuthenticodeSignature -FilePath $env:NOMADIC_SIGN_TARGET -Certificate $cert -TimestampServer $env:NOMADIC_SIGN_TSA -HashAlgorithm SHA256',
        // 'UnknownError' = signed with a cert whose chain is not trusted locally (e.g. self-signed test certs).
        "if ($sig.Status -eq 'Valid' -or $sig.Status -eq 'UnknownError') { exit 0 } else { exit 1 }",
      ].join('\n');

      for (const tsUrl of RFC3161_TIMESTAMP_SERVERS) {
        try {
          execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
            stdio: 'pipe',
            env: {
              ...process.env,
              NOMADIC_SIGN_PFX_PATH: certPath,
              NOMADIC_SIGN_PFX_PASSWORD: certPassword,
              NOMADIC_SIGN_TARGET: filePath,
              NOMADIC_SIGN_TSA: tsUrl,
            },
          });
          console.log(`[CodeSign] Signed ${path.basename(filePath)} via PowerShell (timestamp: ${tsUrl})`);
          signed = true;
          break;
        } catch {
          // Try the next timestamp server.
        }
      }
    }

    if (!signed) {
      const message = `Could not sign ${path.basename(filePath)} (signtool.exe and PowerShell both failed).`;
      if (signingRequired()) throw new Error(`[CodeSign] ${message}`);
      console.warn(`[CodeSign] Warning: ${message} The file is left unsigned.`);
    }
  } finally {
    if (tempCertPath) {
      try {
        fs.rmSync(path.dirname(tempCertPath), { recursive: true, force: true });
      } catch {
        // Best effort cleanup.
      }
    }
  }
}

// CLI: node scripts/sign-windows.js <file>
if (process.argv[1] && path.basename(process.argv[1]) === 'sign-windows.js') {
  const targetFile = process.argv[2];
  if (targetFile) {
    customSign({ path: path.resolve(targetFile) }).catch((err) => {
      console.error(err && err.message ? err.message : err);
      process.exit(1);
    });
  } else {
    console.log('Usage: node scripts/sign-windows.js <path-to-exe>');
  }
}

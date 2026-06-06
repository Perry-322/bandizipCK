import { promises as fs, constants } from 'fs';
import path from 'path';
import winVersionInfo from 'win-version-info';

const signatureRules = [{
        minVersion: '7.43.0.0',
        buffer: Buffer.from([0xC7, 0x86, 0x20, 0x01, 0x00, 0x00, 0x98, 0x00])
    }, {
        minVersion: '7.38.0.1',
        buffer: Buffer.from([0xC7, 0x86, 0x18, 0x01, 0x00, 0x00, 0x98, 0x00])
    }, {
        minVersion: '0.0.0.0',
        buffer: Buffer.from([0xC7, 0x87, 0x18, 0x01, 0x00, 0x00, 0x00, 0x00])
    }
];

signatureRules.sort((a, b) => compareVersions(b.minVersion, a.minVersion));

function getSignatureForVersion(currentVersion) {
    for (const rule of signatureRules) {
        if (compareVersions(currentVersion, rule.minVersion) >= 0) {
            return rule.buffer;
        }
    }
    return null;
}

function compareVersions(v1, v2) {
    const a = v1.split('.').map(Number);
    const b = v2.split('.').map(Number);
    const len = Math.max(a.length, b.length);

    for (let i = 0; i < len; i++) {
        const num1 = a[i] || 0;
        const num2 = b[i] || 0;
        if (num1 > num2)
            return 1;
        if (num1 < num2)
            return -1;
    }
    return 0;
}

async function crackExeFile(exePath, patchOption) {
    try {
        await fs.access(exePath, constants.F_OK);
    } catch {
        throw new Error(`not found: ${exePath}`);
    }

    const version = winVersionInfo(exePath).FileVersion;
    console.log(`exe version: ${version}`);

    const exeData = await fs.readFile(exePath);
    const targetSignature = getSignatureForVersion(version);
    const signatureIndex = exeData.indexOf(targetSignature);
    if (signatureIndex === -1) {
        throw new Error('not found exe signature!');
    }

    const PATCH_OFFSET = 6;
    if (compareVersions(version, '7.38.0.1')) {
        const writeValue = patchOption === '2' ? 0x1B20 : 0x03D4;
        exeData.writeUInt16LE(writeValue, signatureIndex + PATCH_OFFSET);
    } else {
        exeData.writeUInt8(1, signatureIndex + PATCH_OFFSET);
    }

    const parsedPath = path.parse(exePath);
    const backupPath = path.join(parsedPath.dir, `${parsedPath.name}_old.BAK`);
    await fs.copyFile(exePath, backupPath);

    await fs.writeFile(exePath, exeData);
    console.log('done!');
}

crackExeFile('Bandizip.exe', '1').catch(err => {
    console.error(`error: ${err.message}`);
    process.exit(1);
});

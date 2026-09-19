import { promises as Fs, constants as Constants } from 'fs';
import Path from 'path';
import WinVersionInfo from 'win-version-info';

const SignatureRules = [{
        minVersion: '7.43.0.0',
        buffer: Buffer.from([0xC7, 0x86, 0x20, 0x01, 0x00, 0x00, 0x98, 0x00])
    },{
        minVersion: '7.38.0.1',
        buffer: Buffer.from([0xC7, 0x86, 0x18, 0x01, 0x00, 0x00, 0x98, 0x00])
    },{
        minVersion: '0.0.0.0',
        buffer: Buffer.from([0xC7, 0x87, 0x18, 0x01, 0x00, 0x00, 0x00, 0x00])
    }
];

SignatureRules.sort((A, B) => CompareVersions(B.minVersion, A.minVersion));

function GetSignatureForVersion(CurrentVersion) {
    for (const Rule of SignatureRules) {
        if (CompareVersions(CurrentVersion, Rule.minVersion) >= 0) {
            return Rule.buffer;
        }
    }
    return null;
}

function CompareVersions(V1, V2) {
    const A = V1.split('.').map(Number);
    const B = V2.split('.').map(Number);
    const Len = Math.max(A.length, B.length);

    for (let I = 0; I < Len; I++) {
        const Num1 = A[I] || 0;
        const Num2 = B[I] || 0;
        if (Num1 > Num2) return 1;
        if (Num1 < Num2) return -1;
    }
    return 0;
}

async function CrackExeFile(ExePath, PatchOption) {
    try {
        await Fs.access(ExePath, Constants.F_OK);
    } catch {
        throw new Error(`Not found: ${ExePath}`);
    }

    const Version = WinVersionInfo(ExePath).FileVersion;
    console.log(`Exe version: ${Version}`);

    const ExeData = await Fs.readFile(ExePath);
    const TargetSignature = GetSignatureForVersion(Version);
    const SignatureIndex = ExeData.indexOf(TargetSignature);
    if (SignatureIndex === -1) {
        throw new Error('Not found .exe signature!');
    }

    const PatchOffset = 6;
    if (CompareVersions(Version, '7.38.0.1')) {
        const WriteValue = PatchOption === '2' ? 0x1B20 : 0x03D4;
        ExeData.writeUInt16LE(WriteValue, SignatureIndex + PatchOffset);
    } else {
        ExeData.writeUInt8(1, SignatureIndex + PatchOffset);
    }

    const ParsedPath = Path.parse(ExePath);
    const BackupPath = Path.join(ParsedPath.dir, `${ParsedPath.name}_old.BAK`);
    await Fs.copyFile(ExePath, BackupPath);

    await Fs.writeFile(ExePath, ExeData);
    console.log('Done!');
}

const FilesToProcess = ['Bandizip.exe', 'Bandizip.x64.exe', 'Bandizip.x86.exe', 'Bandizip_x64.exe', 'Bandizip_x86.exe', 'Bandizip-x64.exe', 'Bandizip-x86.exe'];
let Missing = 0;

(async () => {
    await Promise.all(FilesToProcess.map(File => 
        CrackExeFile(File, '1').catch(Error => {
            if (Error.message.includes('Not found:')) return Missing++;
            console.error(`Error (${File}): ${Error.message}`);
            process.exit(1);
        });
    }));

    if (Missing === FilesToProcess.length) {
        console.error('Error: Not found any .exe files!');
        process.exit(1);
    }
})();
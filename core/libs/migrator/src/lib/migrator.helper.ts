export class ExporterHelper {
  public static isVersionOutdated(fileVersion: string, currentBammVersion: string) {
    const [b1, b2, b3] = currentBammVersion.split('.').map(x => Number(x));
    const [f1, f2, f3] = fileVersion.split('.').map(x => Number(x));

    if (b1 > f1) {
      return true;
    }

    if (b2 > f2) {
      return true;
    }

    if (b3 > f3) {
      return true;
    }

    return false;
  }
}

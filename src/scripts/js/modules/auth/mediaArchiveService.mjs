/**
 * Media archive service: builds and parses the media ZIP that accompanies a
 * data JSON export. The two files are linked by media id — the JSON references
 * media by id and the ZIP stores each media item as media/<media_id>.<ext>,
 * bidirectionally at every import/export point in the app.
 */
import AdmZip from 'adm-zip';

class MediaArchiveService {
  static MIME_EXTENSIONS = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
  };

  static EXTENSION_MIMES = Object.fromEntries(
    Object.entries(MediaArchiveService.MIME_EXTENSIONS).map(([mime, ext]) => [ext, mime])
  );

  static ARCHIVE_DIR = 'media/';

  /**
   * Split a data URL into { mime, buffer }. Returns null when the value is
   * not a parseable data URL.
   */
  parseDataUrl(dataUrl) {
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(String(dataUrl || ''));
    if (!match) return null;
    return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
  }

  /**
   * File extension for a media data URL (falls back on the media kind).
   */
  extensionFor(dataUrl, kind) {
    const parsed = this.parseDataUrl(dataUrl);
    if (parsed && this.constructor.MIME_EXTENSIONS[parsed.mime]) {
      return this.constructor.MIME_EXTENSIONS[parsed.mime];
    }
    return kind === 'audio' ? 'webm' : 'png';
  }

  /**
   * Build a ZIP from media rows ({ media_id, kind, data }). Each item is
   * stored as media/<media_id>.<ext> with real binary content so the archive
   * is usable outside the app too. Returns a Buffer.
   */
  buildArchive(mediaRows) {
    const zip = new AdmZip();
    for (const row of mediaRows) {
      if (!row || !row.media_id || !row.data) continue;
      const parsed = this.parseDataUrl(row.data);
      const ext = this.extensionFor(row.data, row.kind);
      const content = parsed ? parsed.buffer : Buffer.from(String(row.data));
      zip.addFile(`${this.constructor.ARCHIVE_DIR}${row.media_id}.${ext}`, content);
    }
    return zip.toBuffer();
  }

  /**
   * Manifest entries ({ id, kind, ext }) describing an archive, embedded in
   * the JSON file so the two files can be validated against each other.
   */
  buildManifest(mediaRows) {
    return mediaRows
      .filter((row) => row && row.media_id && row.data)
      .map((row) => ({
        id: row.media_id,
        kind: row.kind,
        ext: this.extensionFor(row.data, row.kind),
      }));
  }

  /**
   * Parse an uploaded archive (Buffer or base64 string) back into a
   * Map<media_id, { kind, dataUrl }>. Unknown files are ignored.
   */
  parseArchive(archive) {
    const buffer = Buffer.isBuffer(archive)
      ? archive
      : Buffer.from(String(archive).replace(/^data:[^,]*,/, ''), 'base64');
    const zip = new AdmZip(buffer);
    const map = new Map();
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const name = entry.entryName.startsWith(this.constructor.ARCHIVE_DIR)
        ? entry.entryName.slice(this.constructor.ARCHIVE_DIR.length)
        : entry.entryName;
      const dot = name.lastIndexOf('.');
      if (dot <= 0) continue;
      const mediaId = name.slice(0, dot);
      const ext = name.slice(dot + 1).toLowerCase();
      const mime = this.constructor.EXTENSION_MIMES[ext];
      if (!mime) continue;
      const data = zip.readFile(entry);
      map.set(mediaId, {
        kind: mime.startsWith('audio/') ? 'audio' : 'image',
        dataUrl: `data:${mime};base64,${data.toString('base64')}`,
      });
    }
    return map;
  }
}

export const mediaArchiveService = new MediaArchiveService();
export { MediaArchiveService };
export default mediaArchiveService;

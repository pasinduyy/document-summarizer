import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { diskStorage } from 'multer'
import { resolveStorageRoot } from '../configuration/app-config.service'
import { MAX_UPLOAD_FILES, MAX_UPLOAD_FILE_SIZE_BYTES } from './documents.constants'

export const documentUploadOptions = {
  storage: diskStorage({
    destination: (_request, _file, callback) => {
      const incomingDirectory = join(resolveStorageRoot(), '.incoming')

      void mkdir(incomingDirectory, { recursive: true }).then(
        () => callback(null, incomingDirectory),
        (error: Error) => callback(error, incomingDirectory),
      )
    },
    filename: (_request, _file, callback) => callback(null, randomUUID()),
  }),
  limits: {
    files: MAX_UPLOAD_FILES,
    fileSize: MAX_UPLOAD_FILE_SIZE_BYTES,
  },
}

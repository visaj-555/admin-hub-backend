import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { MulterError } from 'multer';
import { ApiException } from '../exceptions';

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, _host: ArgumentsHost) {
    if (exception.code === 'LIMIT_FILE_SIZE') {
      throw new ApiException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        'Payload Too Large',
        'errors.fileTooLarge',
        {
          maxSize: '10MB',
        },
      );
    }

    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      'MULTIPART_ERROR',
      'errors.multipart',
    );
  }
}

/**
 *
 * Flmngr server package for Node.
 *
 * This file is a part of the server side implementation of Flmngr -
 * the JavaScript/TypeScript file manager widely used for building apps and editors.
 *
 * Comes as a standalone package for custom integrations,
 * and as a part of N1ED web content builder.
 *
 * Flmngr file manager:       https://flmngr.com
 * N1ED web content builder:  https://n1ed.com
 * Developer website:         https://edsdk.com
 *
 * License: GNU General Public License Version 3 or later
 *
 **/

export class Message {

  public static FILE_ERROR_SYNTAX = -1; // args: name
  public static FILE_ERROR_DOES_NOT_EXIST = -2;
  public static FILE_ERROR_INCORRECT_IMAGE_EXT_CHANGE = -3; // args: oldExt, newExt
  public static ACTION_NOT_FOUND = 0;
  public static UNABLE_TO_CREATE_UPLOAD_DIR = 1;
  public static UPLOAD_ID_NOT_SET = 2;
  public static UPLOAD_ID_INCORRECT = 3;
  public static MALFORMED_REQUEST = 4;
  public static NO_FILE_UPLOADED = 5;
  public static FILE_SIZE_EXCEEDS_LIMIT = 6; // args: name, size, maxSize
  public static INCORRECT_EXTENSION = 7; // args: name, allowedExtsStr
  public static WRITING_FILE_ERROR = 8; // args: name
  public static UNABLE_TO_DELETE_UPLOAD_DIR = 9;
  public static UNABLE_TO_DELETE_FILE = 10; // args: name
  public static DIR_DOES_NOT_EXIST = 11; // args: name
  public static FILES_NOT_SET = 12;
  public static FILE_IS_NOT_IMAGE = 13;
  public static DUPLICATE_NAME = 14;
  public static FILE_ALREADY_EXISTS = 15; // args: name
  public static FILES_ERRORS = 16; // files args: filesWithErrors
  public static UNABLE_TO_COPY_FILE = 17; // args: name, dstName
  public static IMAGE_PROCESS_ERROR = 18;
  public static MAX_RESIZE_WIDTH_EXCEEDED = 19; // args: width, maxWidth, name
  public static MAX_RESIZE_HEIGHT_EXCEEDED = 20; // args: height, maxHeight, name
  public static UNABLE_TO_WRITE_IMAGE_TO_FILE = 21; // args: name
  public static INTERNAL_ERROR = 22;
  public static DOWNLOAD_FAIL_CODE = 23; // args: httpCode
  public static DOWNLOAD_FAIL_IO = 24; // args: IO_Exceptions_text
  public static DOWNLOAD_FAIL_HOST_DENIED = 25; // args: host name
  public static DOWNLOAD_FAIL_INCORRECT_URL = 26; // args: url
  // 27 and 28 reserved for demo server
  public static FILE_SIZE_EXCEEDS_SYSTEM_LIMIT = 29; // args: size, maxSize, like #6, but a limit from php.ini file
  public static FILE_SIZE_EXCEEDS_SYSTEM_LIMIT_2 = 30; // args: size, maxSize, strParameterInfo, like #30, but with info about wrong parameter
  public static FM_FILE_DOES_NOT_EXIST = 10001; // File does not exist: %1
  public static FM_UNABLE_TO_WRITE_PREVIEW_IN_CACHE_DIR = 10002; // Unable to write a preview into cache directory
  public static FM_UNABLE_TO_CREATE_PREVIEW = 10003; // Unable to create a preview
  public static FM_DIR_NAME_CONTAINS_INVALID_SYMBOLS = 10004; // Directory name contains invalid symbols
  public static FM_DIR_NAME_INCORRECT_ROOT = 10005; // Directory has incorrect root
  public static FM_FILE_IS_NOT_IMAGE = 10006; // File is not an image
  public static FM_ROOT_DIR_DOES_NOT_EXIST = 10007; // Root directory does not exists
  public static FM_UNABLE_TO_LIST_CHILDREN_IN_DIRECTORY = 10008; // Unable to list children in the directory
  public static FM_UNABLE_TO_DELETE_DIRECTORY = 10009; // Unable to delete the directory
  public static FM_UNABLE_TO_CREATE_DIRECTORY = 10010; // Unable to create a directory: %1
  public static FM_UNABLE_TO_RENAME = 10011; // Unable to rename
  public static FM_DIR_CANNOT_BE_READ = 10012; // Directory can not be read
  public static FM_ERROR_ON_COPYING_FILES = 10013; // Error on copying files
  public static FM_ERROR_ON_MOVING_FILES = 10014; // Error on moving files
  public static FM_NOT_ERROR_NOT_NEEDED_TO_UPDATE = 10015;
  public static FM_ROOT_DIR_IS_NOT_SET = 10016; // Shows incorrect configuration
  public static FM_DIR_IS_NOT_READABLE = 10017; // %1 is dir
  public static FM_DIR_IS_NOT_WRITABLE = 10018; // %1 is dir

  public code: number;

  public args: (number|string)[];

  public parentException: Error|null;

  private constructor(
      protected isCacheIssue: boolean
  ) {}

  public static createMessage(
    isCacheException: boolean,
    code: number,
    arg1: number|string|null = null,
    arg2: number|string|null = null,
    arg3: number|string|null = null,
    parentException: Error = null
  ) {
    let msg = new Message(isCacheException);
    msg.code = code;
    msg.parentException = parentException;
    if (arg1 != null) {
      msg.args = [];
      msg.args.push(arg1);
      if (arg2 != null) {
        msg.args.push(arg2);
        if (arg3 != null) {
          msg.args.push(arg3);
        }
      }
    }
    return msg;
  }

  public getJSON(): any {
    return {
      code: this.code,
      args: this.args
    }
  }

  public getParentException(): Error|null {
    return this.parentException;
  }

}

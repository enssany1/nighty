import { ArgumentsHost, BadRequestException, Catch, Controller, ExceptionFilter, Get, Inject, Param, PayloadTooLargeException, Post, Req, Res, UploadedFile, UseFilters, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { memoryStorage, MulterError } from "multer";
import { AttachmentsService, MAX_ATTACHMENT_BYTES } from "./attachments.service";

@Catch(MulterError)
class UploadExceptionFilter implements ExceptionFilter {
  catch(error: MulterError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const exception = error.code === "LIMIT_FILE_SIZE" ? new PayloadTooLargeException("Attachment is too large") : new BadRequestException(error.message);
    response.status(exception.getStatus()).json(exception.getResponse());
  }
}

@Controller("attachments")
@UseFilters(UploadExceptionFilter)
export class AttachmentsController {
  constructor(@Inject(AttachmentsService) private readonly attachments: AttachmentsService) {}

  @Post()
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1, fields: 8 } }))
  upload(@Req() request: Request, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException("Attachment file is required");
    const body = request.body as Record<string, string | undefined>;
    return this.attachments.upload({
      file,
      parentType: body.parentType ?? "",
      parentId: body.parentId ?? "",
      disposition: body.disposition ?? "",
      userId: request.auth!.user.id,
      role: request.auth!.user.role,
    });
  }

  @Get(":id/download")
  async download(@Param("id") id: string, @Res() response: Response): Promise<void> {
    const { attachment, data } = await this.attachments.download(id);
    response.setHeader("Content-Type", attachment.mimeType);
    response.setHeader("Content-Length", data.length);
    response.setHeader("Content-Disposition", `${attachment.disposition === "INLINE" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`);
    response.end(data);
  }
}

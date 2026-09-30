import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import nodemailer from 'nodemailer';

import type { Transporter } from 'nodemailer';
import type {
  Options as SMTPTransportOptions,
  SentMessageInfo,
} from 'nodemailer/lib/smtp-transport';
import { generateEmailTemplate } from './template';
import { BadRequestException } from '../exceptions';

interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: {
    filename: string;
    content: Buffer;
    contentType?: string;
  }[];
}

interface MailResponse {
  messageId: string;
  to: string | string[];
  subject: string;
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);

  private readonly transporter: Transporter<SentMessageInfo>;

  private isMailServiceReady = false;

  constructor() {
    const options: SMTPTransportOptions = {
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    this.transporter = nodemailer.createTransport(options);
  }

  async onModuleInit(): Promise<void> {
    await this.verifyConnection();
  }

  private async verifyConnection(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await this.transporter.verify();
      this.isMailServiceReady = true;
      this.logger.log('✅ Mail service connected successfully');
    } catch (error: unknown) {
      this.isMailServiceReady = false;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(
        '⚠️ Mail service configuration issue - emails will not be sent',
        errorMessage,
      );
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async sendEmail(options: EmailOptions): Promise<MailResponse> {
    const isInvalidEmail = Array.isArray(options.to)
      ? options.to.some((email) => !this.isValidEmail(email))
      : !this.isValidEmail(options.to);

    if (!options.to || isInvalidEmail) {
      this.logger.error('Invalid email address', options.to);
      throw new BadRequestException(
        'INVALID_RECIPIENT',
        'mail.errors.invalidRecipient',
      );
    }

    this.logger.log(`Attempting to send email to: ${String(options.to)}`);
    this.logger.log(`Subject: ${options.subject}`);

    const mailOptions = {
      from: `"${process.env.MAIL_FROM_NAME ?? 'BANK AND DEFICIT'}" <${process.env.SMTP_USER}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments,
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const result = await this.transporter.sendMail(mailOptions);

    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      messageId: result.messageId as string,
      to: options.to,
      subject: options.subject,
    };
  }

  // ===================== SEND REGISTRATION OTP ===================== //
  async sendOtp(email: string, otp: string): Promise<void> {
    const subject = 'Your OTP for Verification';
    const message = `
      <p>Thank you for registering with <strong>BANK AND DEFICIT</strong>.</p>
      <p>Your One-Time Password (OTP) for account verification is:</p>
      <div style="margin:20px 0;padding:15px;background:#f3faf8;border:1px solid #d1ece5;text-align:center;font-weight:bold;font-size:24px;letter-spacing:4px;color:#309d81;">
        ${otp}
      </div>
      <p>This OTP is valid for <strong>5 minutes</strong>.<br />Please enter this code on the verification page to complete your registration process.</p>
      <p>We look forward to having you as part of the movement that turns small deeds into global change.</p>
      <p>Warm regards,<br />Team BANK AND DEFICIT</p>
    `;
    await this.sendEmail({
      to: email,
      subject,
      html: generateEmailTemplate(subject, message),
    });
  }

  // ===================== SEND FORGOT PASSWORD OTP ===================== //
  async sendForgotPasswordOtp(email: string, otp: string): Promise<void> {
    const subject = 'Reset Password OTP';
    const message = `
      <p>Hi,</p>
      <p>We received a request to reset your password for your <strong>BANK AND DEFICIT</strong> account.</p>
      <p>Your One-Time Password (OTP) to reset your password is:</p>
      <div style="margin:20px 0;padding:15px;background:#f3faf8;border:1px solid #d1ece5;text-align:center;font-weight:bold;font-size:24px;letter-spacing:4px;color:#309d81;">
        ${otp}
      </div>
      <p>This OTP is valid for <strong>5 minutes</strong>.<br />Please enter this code on the password reset page to proceed.</p>
      <p>Stay secure,<br />Team BANK AND DEFICIT</p>
    `;
    await this.sendEmail({
      to: email,
      subject,
      html: generateEmailTemplate(subject, message),
    });
  }

  // ===================== PASSWORD UPDATE SUCCESS ===================== //
  async passwordUpdateSuccessfully(email: string): Promise<void> {
    const subject = 'Password Updated Successfully';
    const message = `
      <p>Hi,</p>
      <p>Your password for your <strong>BANK AND DEFICIT</strong> account has been successfully updated.</p>
      <p>If you made this change, no further action is required.</p>
      <p>However, if you did not update your password, please contact our support team immediately to secure your account.</p>
      <p>For security reasons, we recommend:</p>
      <ul>
        <li>Using a strong and unique password</li>
        <li>Not sharing your login credentials with anyone</li>
      </ul>
      <p>Thank you for being a part of <strong>BANK AND DEFICIT</strong>.<br />Warm regards,<br />Team BANK AND DEFICIT</p>
    `;
    await this.sendEmail({
      to: email,
      subject,
      html: generateEmailTemplate(subject, message),
    });
    this.logger.log(`Password update notification sent to ${email}`);
  }
}

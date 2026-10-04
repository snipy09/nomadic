export { decodeEntities, deobfuscate, extractEmails, htmlToText, isPlausibleAddress, snippetAround, type FoundEmail } from './extract.ts';
export { addressType, baseDomain, emailDomain, isFreeMailDomain, isRoleLocalPart, localPart, type AddressType } from './classify.ts';
export { checkMx, type MxOptions, type MxRecord, type MxResult } from './mx.ts';
export { VERDICT_NOTES, checkEmail, isValidEmailSyntax, type EmailCheck, type EmailVerdict } from './check.ts';
export { SmtpSender, transportOptions, type MailMessage, type MailTransport, type SendResult, type SmtpSettings, type TransportFactory } from './sender.ts';

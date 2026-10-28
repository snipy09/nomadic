/**
 * Legal documents: the ONLY place their text lives. The website (/terms, /privacy, /refunds)
 * and the desktop app's terms dialog both render from here, so they can never disagree.
 *
 * Written to describe what the app actually does (local-first data with cloud sync, apply only
 * after the user's review, server-side AI with no user keys). Have a lawyer review before launch.
 * Bump LEGAL_VERSION whenever the meaning changes; the app asks users to accept the new version.
 */
import { CURRENCY, PLANS } from './plans';

export const LEGAL_VERSION = '2026-10-28';
export const LEGAL_UPDATED = '28 October 2026';
/** Legal owner/operator (sole proprietor) as it appears on invoices, notices and the payment gateway. */
export const LEGAL_NAME = 'Sajal Kumar Mishra';
/** Trade name the business operates under. */
export const TRADE_NAME = 'Nomadic';
/**
 * Registered business address exactly as on the GST registration (payment gateways ask for the full GST address).
 * Set it here and it appears on the Contact, About and Shipping pages, the footer and every legal page. Left empty
 * until the owner supplies it, because the address is never guessed.
 */
export const REGISTERED_ADDRESS = '';
export const LEGAL_ENTITY = `${LEGAL_NAME} (operating as Nomadic)`;
export const CONTACT_EMAIL = 'sajalmishra0908@gmail.com';
export const CONTACT_PHONE = '+91 93468 78325';
export const CONTACT_PHONE_HREF = 'tel:+919346878325';
/** No nomadic.app mailbox exists yet: support and grievances go to the owner's email until one does. */
export const SUPPORT_EMAIL = CONTACT_EMAIL;
export const GRIEVANCE_EMAIL = CONTACT_EMAIL;
export const GOVERNING_LAW = 'the laws of India';
export const JURISDICTION = 'the courts of India';

export interface LegalSection {
  title: string;
  paragraphs: string[];
}

export interface LegalDoc {
  id: 'terms' | 'privacy' | 'refunds' | 'shipping';
  title: string;
  summary: string;
  sections: LegalSection[];
}

const paidPlans = PLANS.filter((p) => p.priceInr > 0)
  .map((p) => `${p.name} (₹${p.priceInr} per month)`)
  .join(' and ');

export const TERMS: LegalDoc = {
  id: 'terms',
  title: 'Terms of Service',
  summary: 'The agreement between you and Nomadic for using the desktop app, website and services.',
  sections: [
    {
      title: 'About these terms',
      paragraphs: [
        `This website is operated by ${LEGAL_NAME}, trading as ${TRADE_NAME}.`,
        `These terms are an agreement between you and ${LEGAL_ENTITY} ("Nomadic", "we", "us"). They apply to the Nomadic desktop app, the website and any related services (together, "the Service"). By creating an account or using the Service you agree to them. If you do not agree, do not use the Service.`,
        'You must be at least 18 years old, or have the consent of a parent or guardian, to use the Service. You confirm that the information you give us is accurate.',
      ],
    },
    {
      title: 'Your account',
      paragraphs: [
        'You are responsible for keeping your password safe and for everything done through your account. Tell us straight away at ' + SUPPORT_EMAIL + ' if you think someone else has access.',
        'One account is for one person. An account can be signed in on one computer at a time; signing in on another computer ends the earlier session.',
      ],
    },
    {
      title: 'What the Service does',
      paragraphs: [
        'Nomadic helps you learn skills for placements and jobs, find openings, and fill in job applications. It builds a learning roadmap from your goals, shows job listings collected from public sources with a match score, and fills application forms using the profile you provide.',
        'Before any application is submitted, Nomadic shows you every filled field and waits for your confirmation. You decide what is submitted, and you are responsible for checking that it is accurate and true. Nomadic never submits an application without your review.',
        'Job listings come from third-party websites. We try to keep them current and remove closed ones, but we do not control those employers or websites and cannot promise that a listing is accurate, still open, or genuine. Always check the employer before sharing sensitive information.',
        'Learning content includes links to third-party resources that we select and check, but do not own or control.',
      ],
    },
    {
      title: 'AI features',
      paragraphs: [
        'Some features use AI to suggest answers to application questions and to give feedback on practice answers. AI output can be wrong or incomplete. It is a suggestion for you to review, not professional, legal or career advice.',
        'To produce these suggestions we send the relevant parts of your request (for example the question and your profile details or your practice answer) to our AI provider, as described in the Privacy Policy.',
      ],
    },
    {
      title: 'Acceptable use',
      paragraphs: [
        'Do not use the Service to submit false information, impersonate anyone, spam employers, break the rules of the websites you apply on, or break any law.',
        'Do not copy, resell, reverse-engineer or interfere with the Service, try to get around plan limits or security controls, or access other users\' data.',
        'We may suspend or close an account that breaks these terms, after telling you where that is reasonable.',
      ],
    },
    {
      title: 'Plans and payments',
      paragraphs: [
        `The Service has a Free plan and paid plans: ${paidPlans}. Prices are in ${CURRENCY} and include applicable taxes unless stated otherwise. The features and daily limits of each plan are shown in the app and on the website.`,
        'Paid plans are paid by UPI directly to us (you enter the UPI transaction reference and we confirm the payment, usually within one working day) or online through our payment gateway partner PayU (UPI, cards, net banking and wallets), for one month (30 days) at a time. A plan stays active until the end of the period you paid for; when it ends, your account moves to the Free plan and your data stays in place.',
        'Refunds and cancellation are covered by our Refund and Cancellation Policy. Delivery is covered by our Shipping and Delivery Policy.',
      ],
    },
    {
      title: 'Your content',
      paragraphs: [
        'You own the profile, resumes, answers and other content you add. You give us permission to store, process and transmit it only as needed to run the Service for you, as described in the Privacy Policy.',
      ],
    },
    {
      title: 'Our content and licence',
      paragraphs: [
        'The app, website, roadmaps, lessons and other material we create belong to us or our licensors. We give you a personal, non-transferable, revocable licence to use the app on your own computers while you have an account.',
      ],
    },
    {
      title: 'No guarantee of outcomes',
      paragraphs: [
        'Nomadic helps you prepare and apply. It does not guarantee interviews, offers, placements or any hiring decision; those are made by employers.',
      ],
    },
    {
      title: 'Disclaimers and liability',
      paragraphs: [
        'The Service is provided "as is". To the extent the law allows, we do not give warranties that it will always be available, error-free or fit for a particular purpose.',
        'To the extent the law allows, we are not liable for indirect or consequential losses, or for losses caused by third-party websites, employers or services. Our total liability to you for any claim is limited to the amount you paid us in the three months before the claim. Nothing in these terms limits liability that cannot be limited by law.',
      ],
    },
    {
      title: 'Ending your account',
      paragraphs: [
        'You can stop using the Service at any time and ask us to delete your account by writing to ' + SUPPORT_EMAIL + '. We will delete your account data as described in the Privacy Policy.',
      ],
    },
    {
      title: 'Changes',
      paragraphs: [
        'We may update these terms. If a change matters, we will tell you in the app before it applies and ask you to accept it. If you do not accept, you can stop using the Service.',
      ],
    },
    {
      title: 'Law, disputes and contact',
      paragraphs: [
        `These terms are governed by ${GOVERNING_LAW}. Disputes are subject to ${JURISDICTION}. We encourage you to contact us first so we can try to resolve any problem.`,
        `Questions: ${SUPPORT_EMAIL}. Grievances (including under the Consumer Protection (E-Commerce) Rules, 2020 and the Information Technology Act, 2000): ${GRIEVANCE_EMAIL}. We acknowledge grievances within 48 hours and aim to resolve them within 30 days.`,
        `Operator: ${LEGAL_NAME}, trading as ${TRADE_NAME}.${REGISTERED_ADDRESS ? ` Registered address: ${REGISTERED_ADDRESS}.` : ''} Email: ${CONTACT_EMAIL}. Phone: ${CONTACT_PHONE}.`,
      ],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  id: 'privacy',
  title: 'Privacy Policy',
  summary: 'What data Nomadic collects, why, where it is stored, who it is shared with, and your rights.',
  sections: [
    {
      title: 'Who we are',
      paragraphs: [
        `${LEGAL_ENTITY} provides the Nomadic desktop app and website. For the purposes of the Digital Personal Data Protection Act, 2023, we are the data fiduciary for the personal data described here. Contact: ${SUPPORT_EMAIL}.`,
      ],
    },
    {
      title: 'What we collect',
      paragraphs: [
        'Account data: your name, email address, a securely hashed password (or your Google account email and identifier if you sign in with Google), your plan and its status.',
        'Profile and application data you add: contact details, education, skills, target role, links (LinkedIn, GitHub, portfolio), answers to common application questions, resumes, saved jobs, and your application history and notes.',
        'Learning data: your learning goal, lesson and practice progress, quiz answers and review schedule.',
        'Device and security data: a device identifier, device name, IP address at sign-in, and sign-in attempts, used to keep one active session per account and to protect against abuse.',
        'Payment data: for a UPI payment made directly to us we store the order reference, plan, amount, the UPI transaction reference (UTR) you enter and whether we approved it, to confirm the payment and keep payment records. Where a payment gateway partner such as PayU or Razorpay processes a payment, we receive the payment status, amount, plan and a payment reference. We never see or store your UPI PIN, card or bank login details.',
        'We do not collect your passwords for job portals. You sign in to those websites yourself in your browser.',
      ],
    },
    {
      title: 'Where your data is stored',
      paragraphs: [
        'Your data is stored first on your own computer in the app\'s local database. To keep it safe across reinstalls and devices, it is also synced to your Nomadic account on our database provider, Supabase, hosted in Mumbai, India (ap-south-1). Data in transit is encrypted with TLS.',
      ],
    },
    {
      title: 'How we use it',
      paragraphs: [
        'To run the Service: build your roadmap, match jobs to your skills, fill application forms for your review, track your applications and progress, and sync them to your account.',
        'To manage your account and plan, enforce plan limits, send you account emails (such as password-reset and verification codes), and provide support.',
        'To keep the Service secure and prevent fraud and abuse.',
        'We do not sell your personal data, and we do not use it for advertising.',
      ],
    },
    {
      title: 'Who we share it with',
      paragraphs: [
        'Service providers who process data on our behalf, only to provide the Service: Supabase (database and server functions), PayU and Razorpay (online payments, where offered), Resend (sending account emails), and Google (Gemini AI for answer suggestions and practice feedback, and Google sign-in if you choose it).',
        'When you use an AI feature, we send only what that request needs, for example an application question with the relevant profile details, or a practice question with your answer. Our AI requests go through our own server; your data is not used by us to train AI models.',
        'Company logos are loaded from Google\'s public favicon service. It receives the company\'s web address and, like any website, your device\'s IP address; never your account or profile details.',
        'Employers and job websites receive the application details only when you review and submit an application yourself.',
        'Authorities, if the law requires it.',
      ],
    },
    {
      title: 'How long we keep it',
      paragraphs: [
        'We keep your account data while your account is open. If you ask us to delete your account, we delete your account data from our servers within 30 days, except records we must keep by law (such as payment records for tax purposes). Data stored on your own computer is removed when you uninstall the app and delete its data folder.',
        'Security logs such as sign-in attempts are kept for a limited period, typically up to 90 days.',
      ],
    },
    {
      title: 'Launch email list',
      paragraphs: [
        'If you leave your email address on the website to hear when the download opens, we store that address, the page section you used and the time, in our Supabase database in Mumbai. We use it only to email you about the launch, and we do not share it.',
        'You can ask us to remove it at any time by writing to ' + SUPPORT_EMAIL + '. We delete the list once launch emails have been sent, or within 12 months, whichever comes first.',
      ],
    },
    {
      title: 'Your rights',
      paragraphs: [
        'You can access and correct most of your data in the app at any time. You can also ask us for a summary of your data, to correct or delete it, or to withdraw your consent, by writing to ' + SUPPORT_EMAIL + '. Withdrawing consent may mean we can no longer provide parts of the Service.',
        `You can raise a grievance with us at ${GRIEVANCE_EMAIL}. If you are not satisfied with our response, you may complain to the Data Protection Board of India.`,
      ],
    },
    {
      title: 'Children',
      paragraphs: [
        'The Service is meant for students and job seekers aged 18 and over. If you are under 18, use it only with the verifiable consent of a parent or guardian.',
      ],
    },
    {
      title: 'Changes',
      paragraphs: [
        'We will tell you in the app about important changes to this policy before they apply.',
      ],
    },
  ],
};

export const REFUNDS: LegalDoc = {
  id: 'refunds',
  title: 'Refund and Cancellation Policy',
  summary: 'Paid plans last 30 days, do not renew automatically, and are non-refundable except for payment errors, which are refunded in 5 to 7 working days.',
  sections: [
    {
      title: 'Cancellation Policy: duration',
      paragraphs: [
        'Each payment buys one plan period of 30 days. Plans do not renew automatically and nothing is charged again unless you choose to pay for another period, so there is no subscription to cancel.',
        'You can stop at any time. A plan stays active until the end of the 30 days you paid for, then your account moves to the Free plan and keeps all your data. To close your account entirely, write to ' + SUPPORT_EMAIL + '; we confirm within 2 working days and delete your account data within 30 days.',
      ],
    },
    {
      title: 'Refund Policy: no refunds',
      paragraphs: [
        'Paid plans give instant access to digital features, so all payments are final. We do not refund a plan once it is paid for, including for unused days or if you stop using the Service during the 30 days. You can try the Free plan before you pay.',
      ],
    },
    {
      title: 'Refund Policy: payment errors (duration and mode)',
      paragraphs: [
        'The only exception is a payment error: you were charged twice, charged a wrong amount, or paid and your plan was not activated. Report it within 7 days of the payment by writing to ' + SUPPORT_EMAIL + ' with your account email and the payment reference.',
        'Once we confirm the error, the extra or failed amount is refunded in full within 5 to 7 working days. The refund mode is the original payment method (card, UPI account, net banking or wallet used to pay); where that is not possible we refund by UPI or bank transfer to the account that paid. If your plan was not activated, we may activate it instead of refunding, if you prefer.',
      ],
    },
    {
      title: 'Contact',
      paragraphs: [`For any payment question write to ${SUPPORT_EMAIL} with your account email and the payment reference.`,
        `Merchant: ${LEGAL_NAME}, trading as ${TRADE_NAME}.${REGISTERED_ADDRESS ? ` Registered address: ${REGISTERED_ADDRESS}.` : ''} Email: ${CONTACT_EMAIL}. Phone: ${CONTACT_PHONE}.`,
      ],
    },
  ],
};

export const SHIPPING: LegalDoc = {
  id: 'shipping',
  title: 'Shipping and Delivery Policy',
  summary: 'Nomadic is digital software. Nothing is shipped; plans activate within minutes of payment.',
  sections: [
    {
      title: 'No physical shipping',
      paragraphs: [
        'Nomadic is a downloadable software app (Windows, macOS and Android) with online account features. We do not sell or ship physical goods, so there are no shipping charges and no courier delivery.',
      ],
    },
    {
      title: 'Delivery of the app',
      paragraphs: [
        'The app is free to download from our website, and your account works on the Free plan straight away. No payment is needed to download it.',
      ],
    },
    {
      title: 'Delivery of a paid plan: duration',
      paragraphs: [
        'After a successful online payment through PayU, your Pro or Max plan is activated on your account within 5 minutes, usually within 60 seconds. For a UPI payment made directly to us, we confirm the transaction reference and activate the plan within 1 working day.',
        'If your plan is not active 24 hours after a successful payment, write to ' + SUPPORT_EMAIL + ' with your account email and the payment reference. We activate it or refund the payment as set out in the Refund and Cancellation Policy.',
      ],
    },
    {
      title: 'Contact',
      paragraphs: [
        `Questions about delivery: ${SUPPORT_EMAIL}. Merchant: ${LEGAL_NAME}, trading as ${TRADE_NAME}.${REGISTERED_ADDRESS ? ` Registered address: ${REGISTERED_ADDRESS}.` : ''} Phone: ${CONTACT_PHONE}.`,
      ],
    },
  ],
};

export const LEGAL_DOCS = { terms: TERMS, privacy: PRIVACY, refunds: REFUNDS, shipping: SHIPPING } as const;

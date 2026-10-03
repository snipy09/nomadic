import { describe, it, expect } from 'vitest';
import { RuleClassifier } from '../classifier.js';
import type { FormField } from '../contracts.js';

const mk = (label: string, extra: Partial<FormField> = {}): FormField => ({
  id: label, kind: 'text', label, required: false, selector: '#x', frameIndex: 0, visible: true, ...extra,
});
const yn = [{ label: 'Yes', value: 'Yes' }, { label: 'No', value: 'No' }];
const c = new RuleClassifier();
const cls = (f: FormField) => { const r = c.classifyOne(f); return r.profileKey ? `${r.questionType}:${r.profileKey}` : r.questionType; };

describe('RuleClassifier', () => {
  it.each([
    ['First Name', 'profile:firstName'],
    ['Preferred First Name', 'profile:preferredName'],
    ['Family name', 'profile:lastName'],
    ['Full Legal Name', 'profile:fullName'],
    ['Email Address', 'profile:email'],
    ['LinkedIn Profile URL', 'profile:linkedin'],
    ['Share your GitHub profile or portfolio link', 'profile:github'],
    ['Website or Portfolio', 'profile:portfolio'],
    ['Location (City)', 'profile:city'],
    ['Current location', 'profile:location'],
    ['How many years of backend development experience do you have?', 'profile:yearsOfExperience'],
    ['What is your desired annual compensation?', 'profile:desiredSalary'],
    ['What is your notice period?', 'profile:noticePeriod'],
    ['Highest Level of Education', 'profile:degree'],
    ['Phone Device Type', 'unknown'],
    ['Who referred you? (name of employee)', 'unknown'],
    ['Have you previously been employed by Helix Robotics? If so, when?', 'unknown'],
  ])('%s -> %s', (label, expected) => {
    expect(cls(mk(label))).toBe(expected);
  });

  it('classifies eligibility and logistics choice questions', () => {
    expect(cls(mk('Will you now or in the future require sponsorship for employment visa status?', { kind: 'select', options: yn }))).toBe('sponsorship');
    expect(cls(mk('Are you legally authorized to work in the United States?', { kind: 'radio', options: yn }))).toBe('work_authorization');
    expect(cls(mk('Are you willing to relocate to New York, NY?', { kind: 'radio', options: yn }))).toBe('relocation');
    expect(cls(mk('Are you able to work from our San Francisco office 3 days per week?', { kind: 'radio', options: yn }))).toBe('onsite:openToOnsite');
    expect(cls(mk('Are you open to working in a hybrid environment?', { kind: 'combobox' }))).toBe('onsite:openToHybrid');
    expect(cls(mk('Do you have any relatives currently employed by Orion Logistics?', { kind: 'combobox' }))).toBe('unknown');
  });

  it('routes legal, consent and EEO questions to policy types', () => {
    expect(cls(mk('Arbitration Agreement', { kind: 'radio', options: [{ label: 'I acknowledge', value: 'a' }], description: 'binding arbitration ...' }))).toBe('legal_arbitration');
    expect(cls(mk('Certification', { kind: 'checkbox', options: [{ label: 'I certify that the information I have provided is true and correct', value: 'on' }] }))).toBe('legal_certification');
    expect(cls(mk('Talent community', { kind: 'checkbox', options: [{ label: 'Yes, keep me informed about future opportunities', value: 'on' }] }))).toBe('consent_marketing');
    expect(cls(mk('Data Privacy', { kind: 'checkbox', options: [{ label: 'I consent to storing my personal data', value: '1' }] }))).toBe('consent_privacy');
    expect(cls(mk('Gender', { kind: 'select' }))).toBe('eeo_gender');
    expect(cls(mk('Are you Hispanic/Latino?', { kind: 'select' }))).toBe('eeo_hispanic');
    expect(cls(mk('Veteran Status', { kind: 'combobox' }))).toBe('eeo_veteran');
    expect(cls(mk('Disability Status', { kind: 'combobox' }))).toBe('eeo_disability');
  });

  it('uses attribute aliases when the label is unhelpful', () => {
    expect(cls(mk('', { name: 'urls[LinkedIn]' }))).toBe('profile:linkedin');
    expect(cls(mk('', { name: 'org' }))).toBe('profile:currentCompany');
    expect(cls(mk('Type here', { autocomplete: 'given-name' }))).toBe('profile:firstName');
  });

  it('handles files, passwords, multi-selects and long text', () => {
    expect(cls(mk('Resume/CV', { kind: 'file' }))).toBe('resume');
    expect(cls(mk('Password', { inputType: 'password' }))).toBe('unknown:__password');
    expect(cls(mk('Which languages can you work in professionally?', { kind: 'checkbox', multiple: true, options: [{ label: 'English', value: 'e' }, { label: 'Spanish', value: 's' }] }))).toBe('profile:languages');
    expect(cls(mk('Which of the following technologies have you used?', { kind: 'checkbox', multiple: true, options: [{ label: 'Go', value: 'g' }, { label: 'Rust', value: 'r' }] }))).toBe('profile:techStack');
    expect(cls(mk('Cover letter Why should you be hired for this role?', { kind: 'textarea' }))).toBe('cover_letter');
    expect(cls(mk('Why do you want to work at Orbit?', { kind: 'textarea' }))).toBe('open_ended');
    expect(cls(mk('', { kind: 'textarea', placeholder: 'Add a cover letter or anything else you want to share.' }))).toBe('cover_letter');
  });
});

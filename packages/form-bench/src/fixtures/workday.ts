/**
 * Workday-like and other fixtures.
 *  - workday-*: data-automation-id markup, listbox buttons whose options render in a
 *    body-level portal, MM/DD/YYYY date text inputs, multi-step "Save and Continue",
 *    sign-in wall.
 *  - ui5-shadow-form: SuccessFactors-style form built from open shadow-DOM web components.
 *  - generic-careers-richtext: aria-labelledby / placeholder-only labels, split phone,
 *    native date input, contenteditable cover letter, range selects.
 */
import { EEO, KeyCollector, esc, json, page, type Category, type Expected, type Fixture } from './kit.ts';
import type { Profile } from './build.ts';

class WorkdayForm {
  key = new KeyCollector();
  steps: Array<{ title: string; items: string[] }> = [];
  private n = 1;

  step(title: string): this { this.steps.push({ title, items: [] }); return this; }
  private push(h: string) { this.steps[this.steps.length - 1].items.push(h); }
  private label(id: string, text: string, req: boolean) {
    return `<label for="${id}" id="label-${id}">${esc(text)}${req ? '<abbr title="required" aria-hidden="true">*</abbr>' : ''}</label>`;
  }

  text(label: string, aid: string, expected: Expected | null, o: { required?: boolean; category?: Category; placeholder?: string; type?: string } = {}): this {
    const id = `input-${this.n++}`;
    const req = o.required ?? false;
    this.push(`<div data-automation-id="formField-${aid}" class="css-wd-field" data-field>
  ${this.label(id, label, req)}
  <div class="css-wd-input"><input id="${id}" type="${o.type || 'text'}" data-automation-id="${aid}"${req ? ' aria-required="true"' : ''}${o.placeholder ? ` placeholder="${esc(o.placeholder)}"` : ''} data-controlled value=""></div>
</div>`);
    if (expected !== null) this.key.add(label, { expected, selector: `#${id}`, read: 'value', category: o.category || 'profile', required: req });
    return this;
  }

  textarea(label: string, aid: string, expected: Expected, o: { required?: boolean } = {}): this {
    const id = `input-${this.n++}`;
    const req = o.required ?? false;
    this.push(`<div data-automation-id="formField-${aid}" class="css-wd-field" data-field>
  ${this.label(id, label, req)}
  <textarea id="${id}" data-automation-id="${aid}"${req ? ' aria-required="true"' : ''} data-controlled></textarea>
</div>`);
    this.key.add(label, { expected, selector: `#${id}`, read: 'value', category: 'open', required: req });
    return this;
  }

  dropdown(label: string, aid: string, options: string[], expected: Expected | null, o: { required?: boolean; category?: Category } = {}): this {
    const id = `input-${this.n++}`;
    const req = o.required ?? false;
    this.push(`<div data-automation-id="formField-${aid}" class="css-wd-field" data-field>
  ${this.label(id, label, req)}
  <button type="button" id="${id}" class="css-wd-dropdown" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="label-${id} ${id}" data-automation-id="${aid}" data-wd-select="${aid}" data-label="${esc(label)}" data-options="${json(options)}"${req ? ' aria-required="true"' : ''} value="">Select One</button>
  <input type="hidden" name="${aid}" value="">
</div>`);
    if (expected !== null) this.key.add(label, { expected, selector: `button[data-wd-select="${aid}"]`, read: 'wdselect', category: o.category || 'profile', required: req });
    return this;
  }

  radio(label: string, aid: string, options: string[], expected: Expected, o: { required?: boolean; category?: Category } = {}): this {
    const req = o.required ?? true;
    const lid = `label-${this.n++}`;
    this.push(`<fieldset data-automation-id="formField-${aid}" class="css-wd-field" data-field>
  <legend><label id="${lid}">${esc(label)}${req ? '<abbr title="required" aria-hidden="true">*</abbr>' : ''}</label></legend>
  <div role="radiogroup" aria-labelledby="${lid}">${options.map((opt, i) => `<div class="css-wd-radio"><input type="radio" id="${aid}-${i}" name="${aid}" value="${esc(opt)}"${req ? ' aria-required="true"' : ''} data-controlled-choice="${aid}"><label for="${aid}-${i}">${esc(opt)}</label></div>`).join('')}</div>
</fieldset>`);
    this.key.add(label, { expected, selector: `input[name="${aid}"]`, read: 'radio', category: o.category || 'profile', required: req });
    return this;
  }

  checkbox(label: string, aid: string, expected: boolean, o: { required?: boolean; category?: Category } = {}): this {
    const req = o.required ?? false;
    this.push(`<div data-automation-id="formField-${aid}" class="css-wd-field" data-field>
  <div class="css-wd-checkbox"><input type="checkbox" id="${aid}" data-automation-id="${aid}"${req ? ' aria-required="true"' : ''} data-controlled-choice="${aid}" value="on"><label for="${aid}">${esc(label)}</label></div>
</div>`);
    this.key.add(label, { expected, selector: `#${aid}`, read: 'checkbox', category: o.category || 'policy', required: req });
    return this;
  }

  html(org: string, role: string): string {
    const multi = this.steps.length > 1;
    const steps = this.steps.map((s, i) => `<section ${multi ? `data-step="${esc(s.title)}"` : ''} data-automation-id="applyFlowPage">
  <h2 data-automation-id="pageHeaderTitle">${esc(s.title)}</h2>
  ${s.items.join('\n  ')}
  ${multi && i < this.steps.length - 1
    ? '<div data-automation-id="pageFooter"><button type="button" data-automation-id="bottom-navigation-next-button" data-next>Save and Continue</button></div>'
    : '<div data-automation-id="pageFooter"><button type="submit" data-automation-id="bottom-navigation-submit-button">Submit</button></div>'}
</section>`).join('\n');
    return page(`${role} - ${org} Careers`, `
<div data-automation-id="wd-app" class="wd-root">
  <header data-automation-id="header"><span data-automation-id="headerTitle">${esc(org)} Careers</span></header>
  <div data-automation-id="jobPostingHeader"><h1>${esc(role)}</h1></div>
  ${multi ? `<ol data-automation-id="progressBar">${this.steps.map((s) => `<li>${esc(s.title)}</li>`).join('')}</ol><div>Current step: <span data-step-label></span></div>` : ''}
  <form data-automation-id="applyFlowForm">${steps}</form>
</div>`);
  }
}

export function workdayFixtures(p: Profile): Fixture[] {
  const out: Fixture[] = [];
  const startMDY = (() => { const [y, m, d] = String(p.earliestStartDate).split('-'); return `${m}/${d}/${y}`; })();

  // 1. Multi-step application
  {
    const f = new WorkdayForm()
      .step('My Information')
      .dropdown('How Did You Hear About Us?', 'sourceDropdown', ['Company Website', 'LinkedIn', 'Indeed', 'Referral', 'Other'], 'LinkedIn', { required: true })
      .radio('Have you previously worked for Meridian Health as an employee or contractor?', 'candidateIsPreviousWorker', ['Yes', 'No'], '@empty', { category: 'trap' })
      .dropdown('Country', 'countryDropdown', ['India', 'United Kingdom', 'United States of America'], 'United States of America', { required: true })
      .text('First Name', 'legalNameSection_firstName', p.firstName, { required: true })
      .text('Last Name', 'legalNameSection_lastName', p.lastName, { required: true })
      .text('Address Line 1', 'addressSection_addressLine1', p.address)
      .text('City', 'addressSection_city', p.city, { required: true })
      .text('Postal Code', 'addressSection_postalCode', p.postalCode, { required: true })
      .text('Email Address', 'email', p.email, { required: true, type: 'email' })
      .dropdown('Phone Device Type', 'phone-device-type', ['Mobile', 'Home', 'Work'], null, { required: true })
      .text('Phone Number', 'phone-number', p.phone, { required: true, type: 'tel' })
      .step('Application Questions')
      .dropdown('Are you legally authorized to work in the country for which you are applying?', 'q-authorized', ['Yes', 'No'], 'Yes', { required: true })
      .dropdown('Will you now or in the future require sponsorship for employment visa status?', 'q-sponsorship', ['Yes', 'No'], 'No', { required: true })
      .text('Earliest Start Date', 'dateSectionStart', startMDY, { required: true, placeholder: 'MM/DD/YYYY' })
      .step('Voluntary Disclosures')
      .dropdown('Gender', 'gender', ['Male', 'Female', 'I do not wish to self-identify'], 'I do not wish to self-identify', { category: 'eeo' })
      .dropdown('Ethnicity', 'ethnicityDropdown', [...EEO.race.slice(0, -1), 'I do not wish to self-identify'], 'I do not wish to self-identify', { category: 'eeo' })
      .dropdown('Veteran Status', 'veteranStatus', EEO.veteran, "I don't wish to answer", { category: 'eeo' })
      .checkbox('Yes, I have read and consent to the terms and conditions', 'agreementCheckbox', true, { required: true })
      .step('Review');
    out.push({
      key: { id: 'workday-multistep', ats: 'workday', title: 'Workday: multi-step apply flow with portal dropdowns', sourceUrl: 'https://<tenant>.wd5.myworkdayjobs.com/en-US/<site>/job/<location>/<title>_<id>/apply/applyManually', profile: 'sample.json', walls: [], notes: 'Fields on steps 2-3 are only reachable through "Save and Continue".', fields: f.key.fields },
      files: { 'index.html': f.html('Meridian Health', 'Senior Software Engineer') },
    });
  }

  // 2. Sign-in wall
  {
    const key = new KeyCollector();
    key.add('Password', { expected: '@empty', selector: '#password', read: 'value', category: 'trap', required: true });
    key.add('Verify New Password', { expected: '@empty', selector: '#verifyPassword', read: 'value', category: 'trap', required: true });
    out.push({
      key: { id: 'workday-login-wall', ats: 'workday', title: 'Workday: sign-in / create-account wall', sourceUrl: 'https://<tenant>.wd1.myworkdayjobs.com/<site>/login', profile: 'sample.json', walls: ['login'], notes: 'The engine must stop, never invent a password, and report a login wall.', fields: key.fields },
      files: { 'index.html': page('Sign In - Kestrel Workday', `
<div data-automation-id="wd-app" class="wd-root">
  <header data-automation-id="header"><span>Kestrel Careers</span></header>
  <div data-automation-id="signInContent" class="sign-in">
    <h2 data-automation-id="signInHeader">Sign In</h2>
    <form data-automation-id="signInForm">
      <div data-automation-id="formField-email" data-field><label for="email">Email Address<abbr>*</abbr></label><input id="email" type="text" data-automation-id="email" autocomplete="email" aria-required="true"></div>
      <div data-automation-id="formField-password" data-field><label for="password">Password<abbr>*</abbr></label><input id="password" type="password" data-automation-id="password" aria-required="true"></div>
      <button type="submit" data-automation-id="signInSubmitButton">Sign In</button>
      <a href="#" data-automation-id="forgotPasswordLink">Forgot your password?</a>
    </form>
    <div class="create-account" data-automation-id="createAccountContent">
      <h3>Create Account</h3>
      <div data-field><label for="verifyPassword">Verify New Password<abbr>*</abbr></label><input id="verifyPassword" type="password" data-automation-id="verifyPassword" aria-required="true"></div>
      <button type="button" data-automation-id="createAccountSubmitButton">Create Account</button>
    </div>
  </div>
</div>`) },
    });
  }

  // 3. Shadow DOM (SuccessFactors / UI5-style web components)
  {
    const key = new KeyCollector();
    const host = (tag: string, name: string) => [`${tag}[name="${name}"]`];
    key.add('First Name', { expected: p.firstName, selector: 'input', shadow: host('x-field-input', 'firstName'), read: 'value', category: 'profile', required: true });
    key.add('Last Name', { expected: p.lastName, selector: 'input', shadow: host('x-field-input', 'lastName'), read: 'value', category: 'profile', required: true });
    key.add('E-mail', { expected: p.email, selector: 'input', shadow: host('x-field-input', 'email'), read: 'value', category: 'profile', required: true });
    key.add('Cell Phone', { expected: p.phone, selector: 'input', shadow: host('x-field-input', 'cellPhone'), read: 'value', category: 'profile' });
    key.add('City', { expected: p.city, selector: 'input', shadow: host('x-field-input', 'city'), read: 'value', category: 'profile' });
    key.add('Country of Residence', { expected: 'United States', selector: 'select', shadow: host('x-field-select', 'country'), read: 'select', category: 'profile', required: true });
    key.add('Are you legally authorized to work in this country?', { expected: 'Yes', selector: 'select', shadow: host('x-field-select', 'authorized'), read: 'select', category: 'profile', required: true });
    key.add('LinkedIn Profile URL', { expected: p.linkedin, selector: 'input', shadow: host('x-field-input', 'linkedin'), read: 'value', category: 'profile' });
    key.add('I have read and accept the Data Privacy Statement', { expected: true, selector: 'input', shadow: host('x-field-checkbox', 'privacyConsent'), read: 'checkbox', category: 'policy', required: true });
    key.add('Subscribe me to job alerts', { expected: false, selector: 'input', shadow: host('x-field-checkbox', 'jobAlerts'), read: 'checkbox', category: 'policy' });
    out.push({
      key: { id: 'ui5-shadow-form', ats: 'other', title: 'SuccessFactors-style form in open shadow DOM', sourceUrl: 'https://career<N>.successfactors.com/careers?company=<id>', profile: 'sample.json', walls: [], fields: key.fields },
      files: { 'index.html': page('Apply - Halcyon Energy', `
<div class="sf-app"><h1>Apply: Software Engineer II</h1>
<form id="sfApplyForm" class="sf-form">
  <x-field-input label="First Name" name="firstName" required></x-field-input>
  <x-field-input label="Last Name" name="lastName" required></x-field-input>
  <x-field-input label="E-mail" name="email" type="email" required></x-field-input>
  <x-field-input label="Cell Phone" name="cellPhone" type="tel"></x-field-input>
  <x-field-input label="City" name="city"></x-field-input>
  <x-field-select label="Country of Residence" name="country" options='["India","United Kingdom","United States"]' required></x-field-select>
  <x-field-select label="Are you legally authorized to work in this country?" name="authorized" options='["Yes","No"]' required></x-field-select>
  <x-field-input label="LinkedIn Profile URL" name="linkedin" type="url"></x-field-input>
  <x-field-checkbox label="I have read and accept the Data Privacy Statement" name="privacyConsent" required></x-field-checkbox>
  <x-field-checkbox label="Subscribe me to job alerts" name="jobAlerts"></x-field-checkbox>
  <button type="submit">Apply</button>
</form></div>`) },
    });
  }

  // 4. Workday application questions (single page)
  {
    const f = new WorkdayForm()
      .step('Application Questions')
      .dropdown('Are you legally authorized to work in the country for which you are applying?', 'q1', ['Yes', 'No'], 'Yes', { required: true })
      .dropdown('Will you now or in the future require sponsorship for employment visa status (e.g., H-1B)?', 'q2', ['Yes', 'No'], 'No', { required: true })
      .radio('Are you willing to relocate for this position?', 'q3', ['Yes', 'No'], 'Yes')
      .text('Earliest Start Date', 'q4', startMDY, { required: true, placeholder: 'MM/DD/YYYY' })
      .text('Desired Salary', 'q5', p.desiredSalary, { required: true })
      .dropdown('Do you have any relatives currently employed by Orion Logistics?', 'q6', ['Yes', 'No'], '@empty', { required: true, category: 'trap' })
      .dropdown('Highest Level of Education', 'q7', ['High School Diploma', "Bachelor's Degree", "Master's Degree", 'Doctorate'], "Bachelor's Degree", { required: true })
      .textarea('Please describe your experience building distributed systems.', 'q8', '@nonempty', { required: true });
    out.push({
      key: { id: 'workday-questions', ats: 'workday', title: 'Workday: application questions (dropdown portals, date text)', sourceUrl: 'https://<tenant>.wd3.myworkdayjobs.com/<site>/job/<id>/apply', profile: 'sample.json', walls: [], fields: f.key.fields },
      files: { 'index.html': f.html('Orion Logistics', 'Platform Engineer') },
    });
  }

  // 5. Generic careers page: aria-labelledby, placeholders, split phone, rich text
  {
    const key = new KeyCollector();
    const national = String(p.phone).replace(/^\+1\s*/, '');
    key.add('Given name', { expected: p.firstName, selector: '#gn', read: 'value', category: 'profile', required: true });
    key.add('Family name', { expected: p.lastName, selector: 'input[name="familyName"]', read: 'value', category: 'profile', required: true });
    key.add('Email address', { expected: p.email, selector: 'input[name="contactEmail"]', read: 'value', category: 'profile', required: true });
    key.add('Country code', { expected: '+1 (United States)', selector: '#phoneCountry', read: 'select', category: 'profile' });
    key.add('Phone number', { expected: national, selector: '#phoneNational', read: 'value', category: 'profile' });
    key.add('Personal website', { expected: p.portfolio, selector: 'input[name="website"]', read: 'value', category: 'profile' });
    key.add('Years of experience', { expected: '3-5', selector: 'select[name="experience"]', read: 'select', category: 'profile', required: true });
    key.add('Available from', { expected: p.earliestStartDate, selector: '#availableFrom', read: 'value', category: 'profile' });
    key.add('Cover letter', { expected: '@nonempty', selector: '#coverLetterEditor', read: 'text', category: 'open' });
    key.add('I confirm that the information in this application is accurate and complete.', { expected: true, selector: '#accuracy', read: 'checkbox', category: 'policy', required: true });
    out.push({
      key: { id: 'generic-careers-richtext', ats: 'other', title: 'Custom careers form: aria-labelledby, split phone, date, rich text', sourceUrl: 'https://careers.<company>.com/apply/<id>', profile: 'sample.json', walls: [], fields: key.fields },
      files: { 'index.html': page('Apply - Lattice Freight', `
<main class="careers-apply"><h1>Apply: Software Engineer</h1>
<form id="apply" class="apply-form">
  <div class="row" data-field><span id="lbl-gn" class="lbl">Given name *</span><input id="gn" aria-labelledby="lbl-gn" required autocomplete="off"></div>
  <div class="row" data-field><input name="familyName" placeholder="Family name *" required></div>
  <div class="row" data-field><input name="contactEmail" type="email" aria-label="Email address" required></div>
  <div class="row phone-row" data-field role="group" aria-labelledby="lbl-phone"><span id="lbl-phone" class="lbl">Phone</span>
    <select id="phoneCountry" aria-label="Country code"><option value="">Code</option><option value="+44">+44 (United Kingdom)</option><option value="+1">+1 (United States)</option><option value="+91">+91 (India)</option></select>
    <input id="phoneNational" type="tel" aria-label="Phone number" placeholder="Phone number">
  </div>
  <div class="row" data-field><input name="website" type="url" aria-label="Personal website" placeholder="https://"></div>
  <div class="row" data-field><label for="exp">Years of experience *</label><select id="exp" name="experience" required><option value="">Choose...</option><option>0-2</option><option>3-5</option><option>6-10</option><option>10+</option></select></div>
  <div class="row" data-field><label for="availableFrom">Available from</label><input id="availableFrom" type="date"></div>
  <div class="row" data-field><div id="cl-label" class="lbl">Cover letter</div><div id="coverLetterEditor" class="ql-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="cl-label"></div></div>
  <div class="row" data-field><input type="checkbox" id="accuracy" required><label for="accuracy">I confirm that the information in this application is accurate and complete.</label></div>
  <button type="submit">Send application</button>
</form></main>`) },
    });
  }

  return out;
}

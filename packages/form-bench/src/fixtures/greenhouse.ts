/**
 * Greenhouse fixtures.
 *  - classic boards.greenhouse.io: `job_application[...]` names, labels that wrap
 *    custom-question inputs, select2 (hidden native select + widget), EEOC section,
 *    "Attach" resume button with hidden file input.
 *  - embedded board: company careers page with the form in a cross-origin iframe
 *    (`#grnhse_iframe`).
 *  - job-boards.greenhouse.io (React): react-select comboboxes for questions and EEO.
 */
import { EEO, KeyCollector, esc, idSel, json, page, type Category, type Expected, type Fixture } from './kit.ts';
import type { Profile } from './build.ts';

const ast = (req: boolean) => (req ? ' <span class="asterisk">*</span>' : '');

class GhClassicForm {
  key = new KeyCollector();
  main: string[] = [];
  custom: string[] = [];
  eeoc: string[] = [];
  answerIdx = 0;
  constructor(private frame?: string) {}

  private add(label: string, e: Parameters<KeyCollector['add']>[1]) {
    this.key.add(label, this.frame ? { ...e, frame: this.frame } : e);
  }

  std(label: string, id: string, expected: Expected, o: { required?: boolean; type?: string; autocomplete?: string } = {}): this {
    const req = o.required ?? true;
    this.main.push(`<div class="field">
  <label for="${id}">${esc(label)}${ast(req)}</label>
  <input type="${o.type || 'text'}" id="${id}" name="job_application[${id}]"${req ? ' aria-required="true"' : ''}${o.autocomplete ? ` autocomplete="${o.autocomplete}"` : ''} maxlength="255">
</div>`);
    this.add(label, { expected, selector: `#${id}`, read: 'value', category: 'profile', required: req });
    return this;
  }

  resume(): this {
    this.main.push(`<div class="field" id="resume_fieldset">
  <label>Resume/CV${ast(true)}</label>
  <div class="attach-or-paste" data-field="resume">
    <button type="button" class="button" data-source="attach">Attach</button>
    <button type="button" class="button" data-source="dropbox">Dropbox</button>
    <button type="button" class="link" data-source="paste">or enter manually</button>
    <input type="file" id="resume_file" name="job_application[resume]" style="visibility:hidden;position:absolute;left:-9999px" aria-required="true">
  </div>
  <div class="accepted-filetypes">(File types: pdf, doc, docx, txt, rtf)</div>
</div>`);
    this.add('Resume/CV', { expected: '@file', selector: '#resume_file', read: 'file', category: 'file', required: true });
    return this;
  }

  textQ(label: string, expected: Expected, o: { required?: boolean; category?: Category; textarea?: boolean } = {}): this {
    const n = this.answerIdx++;
    const req = o.required ?? false;
    const id = `job_application_answers_attributes_${n}_text_value`;
    const ctl = o.textarea
      ? `<textarea id="${id}" name="job_application[answers_attributes][${n}][text_value]"${req ? ' aria-required="true"' : ''} rows="5"></textarea>`
      : `<input type="text" id="${id}" name="job_application[answers_attributes][${n}][text_value]"${req ? ' aria-required="true"' : ''} maxlength="255">`;
    this.custom.push(`<div class="field">
  <label>${esc(label)}${ast(req)}
    ${ctl}
  </label>
  <input type="hidden" name="job_application[answers_attributes][${n}][question_id]" value="${4000 + n}">
</div>`);
    this.add(label, { expected, selector: `#${id}`, read: 'value', category: o.category || (o.textarea ? 'open' : 'profile'), required: req });
    return this;
  }

  selectQ(label: string, options: string[], expected: Expected, o: { required?: boolean; category?: Category; select2?: boolean; boolean?: boolean } = {}): this {
    const n = this.answerIdx++;
    const req = o.required ?? true;
    const kind = o.boolean ? 'boolean_value' : 'answer_selected_options_attributes_0_question_option_id';
    const id = `job_application_answers_attributes_${n}_${kind}`;
    const optHtml = options.map((opt, i) => `<option value="${o.boolean ? (opt === 'Yes' ? '1' : '0') : 9000 + i}">${esc(opt)}</option>`).join('');
    this.custom.push(`<div class="field">
  <label>${esc(label)}${ast(req)}<br>
    <select id="${id}" name="job_application[answers_attributes][${n}][${kind}]"${o.select2 !== false ? ' class="select2-offscreen" tabindex="-1"' : ''}${req ? ' aria-required="true"' : ''}><option value="">--</option>${optHtml}</select>
  </label>
  <input type="hidden" name="job_application[answers_attributes][${n}][question_id]" value="${4000 + n}">
</div>`);
    this.add(label, { expected, selector: `#${id}`, read: 'select', category: o.category || 'profile', required: req });
    return this;
  }

  checkboxQ(label: string, optionLabel: string, expected: boolean, o: { required?: boolean; category?: Category } = {}): this {
    const n = this.answerIdx++;
    const req = o.required ?? false;
    const id = `job_application_answers_attributes_${n}_boolean_value`;
    this.custom.push(`<div class="field">
  <label>${esc(label)}${ast(req)}</label>
  <label class="checkbox-label"><input type="checkbox" id="${id}" name="job_application[answers_attributes][${n}][boolean_value]" value="1"${req ? ' aria-required="true"' : ''}> ${esc(optionLabel)}</label>
</div>`);
    this.add(label, { expected, selector: `#${id}`, read: 'checkbox', category: o.category || 'policy', required: req });
    return this;
  }

  eeo(label: string, id: string, options: string[], expected: Expected): this {
    this.eeoc.push(`<div class="field">
  <label for="job_application_${id}">${esc(label)}</label>
  <select id="job_application_${id}" name="job_application[${id}]" class="select2-offscreen" tabindex="-1"><option value="">Please select</option>${options.map((o, i) => `<option value="${i + 1}">${esc(o)}</option>`).join('')}</select>
</div>`);
    this.add(label, { expected, selector: `#job_application_${id}`, read: 'select', category: 'eeo' });
    return this;
  }

  formHtml(): string {
    return `<div id="application">
  <h2 id="application_header">Apply for this Job</h2>
  <div id="required_fields_text"><span class="asterisk">*</span> Required</div>
  <form id="application_form" accept-charset="UTF-8" method="post" enctype="multipart/form-data" action="/embed/job_app">
    <div id="main_fields">${this.main.join('\n')}</div>
    <div id="custom_fields">${this.custom.join('\n')}</div>
    ${this.eeoc.length ? `<div id="eeoc_fields"><h3>U.S. Equal Opportunity Employment Information (Completion is voluntary)</h3>
      <p>Individuals seeking employment are considered without regards to race, color, religion, national origin, age, sex, marital status, ancestry, physical or mental disability, veteran status, gender identity, or sexual orientation. You are being given the opportunity to provide the following information in order to help us comply with federal and state Equal Employment Opportunity/Affirmative Action record keeping, reporting, and other legal requirements.</p>
      ${this.eeoc.join('\n')}</div>` : ''}
    <div id="submit_buttons"><input type="button" id="submit_app" value="Submit Application" onclick="this.form.requestSubmit()"></div>
  </form>
</div>`;
  }
}

class GhReactForm {
  key = new KeyCollector();
  parts: string[] = [];

  text(label: string, id: string, expected: Expected, o: { required?: boolean; type?: string; category?: Category } = {}): this {
    const req = o.required ?? false;
    this.parts.push(`<div class="text-input-wrapper" data-field><div class="input-wrapper">
  <label id="${id}-label" for="${id}" class="label">${esc(label)}${req ? '<span aria-hidden="true">*</span>' : ''}</label>
  <input id="${id}" class="input input__single-line" aria-label="${esc(label)}" aria-describedby="${id}-description" aria-invalid="false" aria-required="${req}" type="${o.type || 'text'}" maxlength="255" autocomplete="off" data-controlled value="">
</div></div>`);
    this.key.add(label, { expected, selector: idSel(id), read: 'value', category: o.category || 'profile', required: req });
    return this;
  }

  textarea(label: string, id: string, expected: Expected, o: { required?: boolean; category?: Category } = {}): this {
    const req = o.required ?? false;
    this.parts.push(`<div class="text-input-wrapper" data-field><div class="input-wrapper">
  <label id="${id}-label" for="${id}" class="label">${esc(label)}${req ? '<span aria-hidden="true">*</span>' : ''}</label>
  <textarea id="${id}" class="input input__multi-line" aria-required="${req}" data-controlled></textarea>
</div></div>`);
    this.key.add(label, { expected, selector: idSel(id), read: 'value', category: o.category || 'open', required: req });
    return this;
  }

  resume(): this {
    this.parts.push(`<div class="file-upload" data-field>
  <div class="label upload-label" id="upload-label-resume">Resume/CV<span aria-hidden="true">*</span></div>
  <div class="file-upload__wrapper"><div class="button-container"><button type="button" class="btn btn--pill">Attach</button><button type="button" class="btn btn--pill">Dropbox</button><button type="button" class="btn btn--pill">Enter manually</button></div>
  <input id="resume" type="file" class="visually-hidden" aria-labelledby="upload-label-resume" aria-required="true" accept=".pdf,.doc,.docx,.txt,.rtf"></div>
  <p class="file-upload__filetypes">Accepted file types: pdf, doc, docx, txt, rtf</p>
</div>`);
    this.key.add('Resume/CV', { expected: '@file', selector: '#resume', read: 'file', category: 'file', required: true });
    return this;
  }

  rselect(label: string, id: string, options: string[], expected: Expected, o: { required?: boolean; category?: Category } = {}): this {
    const req = o.required ?? false;
    this.parts.push(`<div class="select__container" data-field>
  <label id="${id}-label" for="${id}" class="label select__label">${esc(label)}${req ? '<span aria-hidden="true">*</span>' : ''}</label>
  <div class="select-shell remix-css-b62m3t-container" data-rselect="${id}" data-options="${json(options)}">
    <div class="select__control remix-css-13cymwt-control"><div class="select__value-container"><div class="select__placeholder" id="react-select-${id}-placeholder">Select...</div><div class="select__single-value" style="display:none"></div><div class="select__input-container" data-value=""><input class="select__input" style="color:inherit;background:0;opacity:1;width:100%;" autocapitalize="none" autocomplete="off" autocorrect="off" id="${id}" spellcheck="false" tabindex="0" type="text" aria-autocomplete="list" aria-expanded="false" aria-haspopup="true" aria-labelledby="${id}-label"${req ? ' aria-required="true"' : ''} role="combobox" value=""></div></div><div class="select__indicators"><button type="button" class="icon-button" aria-label="Toggle flyout" tabindex="-1">&#9662;</button></div></div>
    <input name="${id}" type="hidden" value="">
  </div>
</div>`);
    this.key.add(label, { expected, selector: `[data-rselect="${id}"]`, read: 'rselect', category: o.category || 'profile', required: req });
    return this;
  }

  checkboxGroup(legend: string, name: string, options: string[], expected: Expected, o: { required?: boolean; category?: Category } = {}): this {
    const req = o.required ?? false;
    this.parts.push(`<fieldset class="checkbox" data-field>
  <legend class="label">${esc(legend)}${req ? '<span aria-hidden="true">*</span>' : ''}</legend>
  ${options.map((opt, i) => `<div class="checkbox__wrapper"><div class="checkbox__input"><input type="checkbox" id="${name}_${i}" name="${name}[]" value="${esc(opt)}" data-controlled-choice="${name}"></div><label for="${name}_${i}" class="checkbox__label">${esc(opt)}</label></div>`).join('\n  ')}
</fieldset>`);
    this.key.add(legend, { expected, selector: `input[name="${name}[]"]`, read: options.length === 1 ? 'checkbox' : 'checkboxes', category: o.category || 'policy', required: req });
    return this;
  }

  section(title: string, text?: string): this {
    this.parts.push(`<div class="application--section"><h3 class="section-header">${esc(title)}</h3>${text ? `<p class="section-text">${esc(text)}</p>` : ''}</div>`);
    return this;
  }

  html(org: string, role: string): string {
    return page(`Job Application for ${role} at ${org}`, `
<main class="main font-secondary job-post">
  <div class="job__header"><h1 class="section-header section-header--large">${esc(role)}</h1><div class="job__location">Remote - US</div></div>
  <div class="application--container">
    <h2 class="section-header">Apply for this job</h2>
    <form id="application-form" class="application--form">
      <div class="application--questions">${this.parts.join('\n')}</div>
      <button type="submit" class="btn btn--rounded">Submit application</button>
    </form>
  </div>
</main>`);
  }
}

export function greenhouseFixtures(p: Profile): Fixture[] {
  const out: Fixture[] = [];

  // 1. classic board
  {
    const f = new GhClassicForm()
      .std('First Name', 'first_name', p.firstName, { autocomplete: 'given-name' })
      .std('Last Name', 'last_name', p.lastName, { autocomplete: 'family-name' })
      .std('Email', 'email', p.email, { type: 'email' })
      .std('Phone', 'phone', p.phone, { type: 'tel' })
      .resume()
      .textQ('LinkedIn Profile', p.linkedin)
      .textQ('Website', p.portfolio)
      .selectQ('Are you legally authorized to work in the United States?', ['Yes', 'No'], 'Yes', { boolean: true })
      .selectQ('Will you now or in the future require sponsorship for employment visa status (e.g. H-1B visa status)?', ['Yes', 'No'], 'No', { boolean: true })
      .textQ('What is your desired annual compensation?', p.desiredSalary, { required: true });
    out.push({
      key: { id: 'greenhouse-classic', ats: 'greenhouse', title: 'Greenhouse classic: select2 + wrapped labels', sourceUrl: 'https://boards.greenhouse.io/<org>/jobs/<id>', profile: 'sample.json', walls: [], fields: f.key.fields },
      files: { 'index.html': page('Job Application for Senior Software Engineer at Brightline', `<div id="wrapper"><div id="app_body"><div id="header"><h1 class="app-title">Senior Software Engineer</h1><span class="company-name">at Brightline</span><div class="location">Austin, TX</div></div><div id="content"><p>We are looking for engineers who love shipping.</p></div>${f.formHtml()}</div></div>`) },
    });
  }

  // 2. classic board with the full EEOC section
  {
    const f = new GhClassicForm()
      .std('First Name', 'first_name', p.firstName)
      .std('Last Name', 'last_name', p.lastName)
      .std('Email', 'email', p.email, { type: 'email' })
      .std('Phone', 'phone', p.phone, { type: 'tel', required: false })
      .resume()
      .textQ('LinkedIn Profile', p.linkedin)
      .selectQ('How did you hear about this job?', ['LinkedIn', 'Indeed', 'Glassdoor', 'Employee Referral', 'Other'], 'LinkedIn')
      .eeo('Gender', 'gender', ['Male', 'Female', 'Decline To Self Identify'], 'Decline To Self Identify')
      .eeo('Are you Hispanic/Latino?', 'hispanic_ethnicity', ['Yes', 'No', 'Decline To Self Identify'], 'Decline To Self Identify')
      .eeo('Veteran Status', 'veteran_status', EEO.veteran, "I don't wish to answer")
      .eeo('Disability Status', 'disability_status', EEO.disability, "I don't wish to answer");
    out.push({
      key: { id: 'greenhouse-eeo', ats: 'greenhouse', title: 'Greenhouse classic: EEOC section', sourceUrl: 'https://boards.greenhouse.io/<org>/jobs/<id>', profile: 'sample.json', walls: [], fields: f.key.fields },
      files: { 'index.html': page('Job Application for Data Engineer at Cobalt', `<div id="wrapper"><div id="app_body"><div id="header"><h1 class="app-title">Data Engineer</h1><span class="company-name">at Cobalt</span></div>${f.formHtml()}</div></div>`) },
    });
  }

  // 3. embedded board in a cross-origin iframe
  {
    const f = new GhClassicForm('gh-frame.html')
      .std('First Name', 'first_name', p.firstName)
      .std('Last Name', 'last_name', p.lastName)
      .std('Email', 'email', p.email, { type: 'email' })
      .std('Phone', 'phone', p.phone, { type: 'tel' })
      .resume()
      .textQ('LinkedIn Profile', p.linkedin)
      .textQ('Current Company', p.currentCompany)
      .selectQ('Will you now or in the future require visa sponsorship?', ['Yes', 'No'], 'No', { boolean: true })
      .checkboxQ('Data Privacy', 'I consent to Vertex storing my personal data for the purpose of processing my application, as described in the Applicant Privacy Notice.', true, { required: true })
      .checkboxQ('Future opportunities', 'Please contact me about future job openings and events.', false);
    out.push({
      key: { id: 'greenhouse-iframe-embed', ats: 'greenhouse', title: 'Greenhouse embed: form inside a cross-origin iframe', sourceUrl: 'https://www.<company>.com/careers/job?gh_jid=<id>', profile: 'sample.json', walls: [], notes: 'The form lives in #grnhse_iframe served from a different origin.', fields: f.key.fields },
      files: {
        'index.html': page('Careers - Vertex', `<header class="site-header"><a href="/">Vertex</a><nav><a href="#">Product</a><a href="#">Careers</a></nav></header>
<main class="careers"><h1>Platform Engineer</h1><p>Join our platform team.</p>
<div id="grnhse_app"><iframe id="grnhse_iframe" title="Greenhouse Job Board" width="100%" height="1600" frameborder="0" scrolling="no" src="{{ORIGIN_B}}/greenhouse-iframe-embed/gh-frame.html"></iframe></div></main>`),
        'gh-frame.html': page('Greenhouse Job Board', f.formHtml()),
      },
    });
  }

  // 4. job-boards.greenhouse.io (React)
  {
    const f = new GhReactForm()
      .text('First Name', 'first_name', p.firstName, { required: true })
      .text('Last Name', 'last_name', p.lastName, { required: true })
      .text('Preferred First Name', 'preferred_name', 'Jordan', { category: 'profile' })
      .text('Email', 'email', p.email, { required: true, type: 'email' })
      .text('Phone', 'phone', p.phone, { type: 'tel' })
      .resume()
      .text('LinkedIn Profile', 'question_30001', p.linkedin)
      .rselect('Are you legally authorized to work in the country in which you are applying?', 'question_30002', ['Yes', 'No'], 'Yes', { required: true })
      .rselect('Will you now, or in the future, require sponsorship for employment visa status?', 'question_30003', ['Yes', 'No'], 'No', { required: true })
      .rselect('Are you open to working in a hybrid environment?', 'question_30004', ['Yes', 'No'], 'Yes', { required: true });
    out.push({
      key: { id: 'greenhouse-react-select', ats: 'greenhouse', title: 'Greenhouse job-boards (React): react-select questions', sourceUrl: 'https://job-boards.greenhouse.io/<org>/jobs/<id>', profile: 'sample.json', walls: [], fields: f.key.fields },
      files: { 'index.html': f.html('Sable Security', 'Senior Software Engineer, Detection') },
    });
  }

  // 5. job-boards (React) with EEO comboboxes + open questions
  {
    const f = new GhReactForm()
      .text('First Name', 'first_name', p.firstName, { required: true })
      .text('Last Name', 'last_name', p.lastName, { required: true })
      .text('Email', 'email', p.email, { required: true, type: 'email' })
      .resume()
      .text('Location (City)', 'candidate-location', p.city, { required: true })
      .textarea('Why are you interested in this role?', 'question_40001', '@nonempty', { required: true })
      .text('What is your notice period?', 'question_40002', p.noticePeriod, { required: true })
      .checkboxGroup('Acknowledgement', 'question_40003', ['I acknowledge that I have read and understand the Candidate Privacy Policy.'], true, { required: true })
      .section('Voluntary Self-Identification', 'For government reporting purposes, we ask candidates to respond to the below self-identification survey. Completion of the form is entirely voluntary.')
      .rselect('Gender', 'gender', EEO.gender, 'Decline to self-identify', { category: 'eeo' })
      .rselect('Are you Hispanic/Latino?', 'hispanic_ethnicity', EEO.hispanic, 'Decline to self-identify', { category: 'eeo' })
      .rselect('Veteran Status', 'veteran_status', EEO.veteran, "I don't wish to answer", { category: 'eeo' })
      .rselect('Disability Status', 'disability_status', EEO.disability, "I don't wish to answer", { category: 'eeo' });
    out.push({
      key: { id: 'greenhouse-react-eeo', ats: 'greenhouse', title: 'Greenhouse job-boards (React): EEO comboboxes + open questions', sourceUrl: 'https://job-boards.greenhouse.io/<org>/jobs/<id>', profile: 'sample.json', walls: [], fields: f.key.fields },
      files: { 'index.html': f.html('Tessellate', 'Staff Engineer, Infrastructure') },
    });
  }

  return out;
}

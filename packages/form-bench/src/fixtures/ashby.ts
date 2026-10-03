/**
 * Ashby (jobs.ashbyhq.com/<org>/<posting>/application) fixtures.
 * Patterns: `_systemfield_*` names, CSS-module class names, React-controlled
 * inputs, Yes/No button groups, custom radios/checkboxes with opacity:0 inputs,
 * long arbitration paragraphs with an acknowledgement option, location typeahead,
 * react-select EEO comboboxes.
 */
import { ARBITRATION_TEXT, EEO, KeyCollector, LOCATIONS, esc, fakeUuid, idSel, json, page, type Category, type Expected, type Fixture } from './kit.ts';
import type { Profile } from './build.ts';

class AshbyForm {
  key = new KeyCollector();
  parts: string[] = [];

  private label(text: string, forId: string | null, required: boolean): string {
    return `<label class="_heading_101oc_53 _label_17s1s_9${required ? ' _required_101oc_92' : ''}"${forId ? ` for="${forId}"` : ''}>${esc(text)}</label>`;
  }

  text(label: string, expected: Expected, o: { id?: string; type?: string; required?: boolean; category?: Category; description?: string } = {}): this {
    const id = o.id || fakeUuid(label);
    const req = o.required ?? false;
    this.parts.push(`<div class="_fieldEntry_17s1s_1 ashby-application-form-field-entry" data-field>
  ${this.label(label, id, req)}
  ${o.description ? `<p class="_description_17s1s_30">${esc(o.description)}</p>` : ''}
  <input class="_input_1wkz4_28 _input_17s1s_45" id="${id}" name="${id}" type="${o.type || 'text'}" placeholder="Type here..."${req ? ' required' : ''} data-controlled value="">
</div>`);
    this.key.add(label, { expected, selector: idSel(id), read: 'value', category: o.category || 'profile', required: req });
    return this;
  }

  textarea(label: string, expected: Expected, o: { required?: boolean; category?: Category } = {}): this {
    const id = fakeUuid(label);
    const req = o.required ?? false;
    this.parts.push(`<div class="_fieldEntry_17s1s_1 ashby-application-form-field-entry" data-field>
  ${this.label(label, id, req)}
  <textarea class="_input_1wkz4_28 _textarea_1wkz4_40" id="${id}" name="${id}" placeholder="Type here..."${req ? ' required' : ''} data-controlled></textarea>
</div>`);
    this.key.add(label, { expected, selector: idSel(id), read: 'value', category: o.category || 'open', required: req });
    return this;
  }

  resume(): this {
    this.parts.push(`<div class="_fieldEntry_17s1s_1 ashby-application-form-field-entry" data-field>
  ${this.label('Resume', '_systemfield_resume', true)}
  <div class="_container_kd3dm_1 _fileUpload_">
    <button type="button" class="_button_8wvgw_29 _secondary_8wvgw_92">Upload File</button>
    <input id="_systemfield_resume" name="_systemfield_resume" type="file" accept=".pdf,.doc,.docx" style="display:none" required>
  </div>
</div>`);
    this.key.add('Resume', { expected: '@file', selector: '#_systemfield_resume', read: 'file', category: 'file', required: true });
    return this;
  }

  yesNo(label: string, expected: Expected, o: { required?: boolean; category?: Category } = {}): this {
    const name = fakeUuid(label);
    const req = o.required ?? true;
    this.parts.push(`<div class="_fieldEntry_17s1s_1 ashby-application-form-field-entry" data-field>
  ${this.label(label, null, req)}
  <div class="_yesno_hkyf8_143 yesno" data-name="${name}"><button type="button" class="_container_pjyt6_1 _option_y2cw4_33">Yes</button><button type="button" class="_container_pjyt6_1 _option_y2cw4_33">No</button></div>
  <input type="hidden" name="${name}" value="">
</div>`);
    this.key.add(label, { expected, selector: `.yesno[data-name="${name}"]`, read: 'pressed', category: o.category || 'profile', required: req });
    return this;
  }

  choice(type: 'radio' | 'checkbox', label: string, options: string[], expected: Expected, o: { required?: boolean; category?: Category; description?: string; legend?: boolean } = {}): this {
    const name = fakeUuid(label);
    const req = o.required ?? true;
    const opts = options.map((opt, i) => {
      const id = `${name}-labeled-${type}-${i}`;
      return `<div class="_option_1v5e2_35" data-option>
      <span class="_${type}Container_1v5e2_1"><input type="${type}" class="_input_1v5e2_17" style="opacity:0;position:absolute;width:1px;height:1px;margin:0" id="${id}" name="${name}" value="${esc(opt)}" data-controlled-choice="${name}"><span class="_fake${type}_1v5e2_20" aria-hidden="true"></span></span>
      <label class="_label_1v5e2_60" for="${id}">${esc(opt)}</label>
    </div>`;
    }).join('\n    ');
    const heading = o.legend
      ? `<legend class="_heading_101oc_53${req ? ' _required_101oc_92' : ''}">${esc(label)}</legend>`
      : this.label(label, null, req);
    this.parts.push(`<fieldset class="_container_7rgag_1 _fieldEntry_17s1s_1 ashby-application-form-field-entry" data-field>
  ${heading}
  ${o.description ? `<div class="_description_17s1s_30"><p>${esc(o.description)}</p></div>` : ''}
  <div class="_options_1v5e2_30">
    ${opts}
  </div>
</fieldset>`);
    this.key.add(label, {
      expected,
      selector: `input[name="${name}"]`,
      read: type === 'radio' ? 'radio' : options.length === 1 ? 'checkbox' : 'checkboxes',
      category: o.category || 'profile',
      required: req,
    });
    return this;
  }

  location(expected: Expected): this {
    this.parts.push(`<div class="_fieldEntry_17s1s_1 ashby-application-form-field-entry" data-field>
  ${this.label('Location', '_systemfield_location', true)}
  <div class="_inputContainer_1g6v0_1 combobox-wrap">
    <input id="_systemfield_location" name="_systemfield_location" class="_input_1wkz4_28" role="combobox" aria-autocomplete="list" aria-expanded="false" autocomplete="off" placeholder="Start typing..." required data-autocomplete="_systemfield_location" data-options="${json(LOCATIONS)}">
  </div>
</div>`);
    this.key.add('Location', { expected, selector: '#_systemfield_location', read: 'value', category: 'profile', required: true });
    return this;
  }

  rselect(label: string, options: string[], expected: Expected, o: { required?: boolean; category?: Category } = {}): this {
    const id = fakeUuid(label);
    const req = o.required ?? false;
    this.parts.push(`<div class="_fieldEntry_17s1s_1 ashby-application-form-field-entry select__container" data-field>
  <label id="${id}-label" class="_heading_101oc_53${req ? ' _required_101oc_92' : ''}" for="${id}">${esc(label)}</label>
  <div class="select-shell" data-rselect="${id}" data-options="${json(options)}">
    <div class="select__control"><div class="select__value-container"><div class="select__placeholder">Select...</div><div class="select__single-value" style="display:none"></div><div class="select__input-container"><input class="select__input" role="combobox" aria-expanded="false" aria-haspopup="true" aria-autocomplete="list" id="${id}" aria-labelledby="${id}-label" autocomplete="off" type="text"${req ? ' aria-required="true"' : ''}></div></div><div class="select__indicators"><span class="select__indicator" aria-hidden="true">&#9662;</span></div></div>
    <input type="hidden" name="${id}">
  </div>
</div>`);
    this.key.add(label, { expected, selector: `[data-rselect="${id}"]`, read: 'rselect', category: o.category || 'eeo', required: req });
    return this;
  }

  section(title: string): this {
    this.parts.push(`<div class="_section_1ce5x_1"><h2 class="_title_1ce5x_10">${esc(title)}</h2></div>`);
    return this;
  }

  html(org: string, role: string): string {
    return page(`${role} @ ${org} | Ashby`, `
<div class="ashby-job-posting-page _container_ud4nd_29">
  <div class="ashby-job-posting-header"><h1 class="ashby-job-posting-heading">${esc(role)}</h1><p>${esc(org)} &middot; Engineering &middot; Full time</p></div>
  <div role="tablist" class="_tabs_"><a role="tab" aria-selected="false" href="#overview">Overview</a><a role="tab" aria-selected="true" href="#application">Application</a></div>
  <div class="ashby-application-form-container _applicationForm_">
    <form class="_form_ ashby-application-form">
      ${this.parts.join('\n      ')}
      <div class="_errorCallout_" style="display:none">Your form needs corrections</div>
      <button type="submit" class="_button_8wvgw_29 _primary_8wvgw_44 ashby-application-form-submit-button">Submit Application</button>
    </form>
  </div>
</div>`);
  }
}

function fx(id: string, title: string, org: string, role: string, form: AshbyForm, notes?: string): Fixture {
  return {
    key: {
      id, ats: 'ashby', title, sourceUrl: `https://jobs.ashbyhq.com/${org.toLowerCase().replace(/\s+/g, '')}/<posting-uuid>/application`,
      profile: 'sample.json', walls: [], notes, fields: form.key.fields,
    },
    files: { 'index.html': form.html(org, role) },
  };
}

export function ashbyFixtures(p: Profile): Fixture[] {
  const out: Fixture[] = [];

  out.push(fx('ashby-basic', 'Ashby: system fields + links + resume', 'Lumen Labs', 'Senior Software Engineer',
    new AshbyForm()
      .text('Name', p.fullName, { id: '_systemfield_name', required: true })
      .text('Email', p.email, { id: '_systemfield_email', type: 'email', required: true })
      .resume()
      .text('Phone', p.phone, { type: 'tel', required: true })
      .text('LinkedIn Profile', p.linkedin, { required: true })
      .text('GitHub', p.github)
      .text('Website or Portfolio', p.portfolio)
      .text('Current Company', p.currentCompany)
      .yesNo('Are you legally authorized to work in the United States?', 'Yes')
      .yesNo('Will you now or in the future require visa sponsorship to work in the United States?', 'No'),
  ));

  out.push(fx('ashby-arbitration', 'Ashby: arbitration acknowledgement + certification', 'Helix Robotics', 'Backend Engineer',
    new AshbyForm()
      .text('Full Legal Name', p.fullName, { id: '_systemfield_name', required: true })
      .text('Email', p.email, { id: '_systemfield_email', type: 'email', required: true })
      .resume()
      .yesNo('Are you able to work from our San Francisco office 3 days per week?', 'Yes')
      .choice('radio', 'Arbitration Agreement', ['I acknowledge that I have opened, read and agree to the Mutual Arbitration Agreement'],
        'I acknowledge that I have opened, read and agree to the Mutual Arbitration Agreement', { category: 'policy', description: ARBITRATION_TEXT })
      .choice('checkbox', 'Certification', ['I certify that the information I have provided is true and correct and that I have not withheld any material information.'],
        true, { category: 'policy' })
      .choice('checkbox', 'Talent community', ['Yes, keep me informed about future opportunities at Helix Robotics'], false, { required: false, category: 'policy' })
      .text('Have you previously been employed by Helix Robotics? If so, when?', '@empty', { category: 'trap' }),
    'Old engines tick every checkbox; the marketing opt-in must stay unchecked.',
  ));

  out.push(fx('ashby-yesno-eeo', 'Ashby: yes/no buttons + EEO comboboxes', 'Northwind AI', 'Full Stack Engineer',
    new AshbyForm()
      .text('Name', p.fullName, { id: '_systemfield_name', required: true })
      .text('Email', p.email, { id: '_systemfield_email', type: 'email', required: true })
      .resume()
      .yesNo('Are you willing to relocate to New York, NY?', 'Yes')
      .yesNo('Do you have an existing non-compete agreement that would prevent you from joining?', '@empty', { category: 'trap' })
      .section('U.S. Equal Employment Opportunity Information')
      .rselect('Gender', EEO.gender, 'Decline to self-identify')
      .rselect('Race', EEO.race, 'Decline to self-identify')
      .rselect('Veteran Status', EEO.veteran, "I don't wish to answer")
      .rselect('Disability Status', EEO.disability, "I don't wish to answer"),
  ));

  out.push(fx('ashby-location-combobox', 'Ashby: location typeahead + multi-select', 'Quanta Health', 'Software Engineer, Platform',
    new AshbyForm()
      .text('Name', p.fullName, { id: '_systemfield_name', required: true })
      .text('Email', p.email, { id: '_systemfield_email', type: 'email', required: true })
      .location('Austin, Texas, United States')
      .resume()
      .text('How many years of professional software engineering experience do you have?', String(p.yearsOfExperience), { type: 'number', required: true })
      .text('What are your salary expectations?', p.desiredSalary, { required: true })
      .choice('checkbox', 'Which of the following technologies have you used professionally?', ['TypeScript', 'Go', 'Rust', 'PostgreSQL', 'Kubernetes'],
        ['TypeScript', 'PostgreSQL'], { required: false })
      .choice('radio', 'How did you hear about us?', ['LinkedIn', 'Referral', 'Company website', 'Other'], 'LinkedIn', { legend: true }),
    'Location only sticks when picked from the list; the technology multi-select must match techStack exactly.',
  ));

  out.push(fx('ashby-custom-questions', 'Ashby: open-ended + consent', 'Orbit Payments', 'Senior Frontend Engineer',
    new AshbyForm()
      .text('Name', p.fullName, { id: '_systemfield_name', required: true })
      .text('Email', p.email, { id: '_systemfield_email', type: 'email', required: true })
      .resume()
      .text('LinkedIn', p.linkedin)
      .textarea('Why do you want to work at Orbit Payments?', '@nonempty', { required: true })
      .textarea('Tell us about a technically challenging project you led.', '@nonempty', { required: true })
      .text('Who referred you? (name of employee)', '@empty', { category: 'trap' })
      .choice('checkbox', 'Privacy Notice', ['I have read and agree to the Orbit Payments Candidate Privacy Notice'], true, { category: 'policy' }),
  ));

  return out;
}

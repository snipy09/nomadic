/**
 * Lever (jobs.lever.co/<org>/<uuid>/apply) fixtures.
 * Patterns: <label> wrapping .application-label + .application-field, `urls[LinkedIn]`
 * style names, custom question "cards" (`cards[<uuid>][field0]`) whose question text
 * sits in a div (not a <label>), radio/checkbox lists, EEO selects, "comments" box.
 */
import { EEO, KeyCollector, esc, fakeUuid, page, type Category, type Expected, type Fixture } from './kit.ts';
import type { Profile } from './build.ts';

const reqMark = (r: boolean) => (r ? '<span class="required">&#10033;</span>' : '');

class LeverForm {
  key = new KeyCollector();
  sections: Array<{ title: string; items: string[]; cls?: string }> = [];
  private cur: { title: string; items: string[]; cls?: string } | null = null;
  private cardId = fakeUuid('card');
  private cardField = 0;

  section(title: string, cls?: string): this {
    this.cur = { title, items: [], cls };
    this.sections.push(this.cur);
    return this;
  }
  private push(html: string) { if (!this.cur) this.section('Submit your application'); this.cur!.items.push(html); }

  resume(): this {
    this.push(`<li class="application-question resume">
  <label><div class="application-label">Resume/CV${reqMark(true)}</div>
  <div class="application-field"><a class="postings-btn template-btn-utility visible-resume-upload"><input type="file" id="resume-upload-input" name="resume" class="application-file-input" style="opacity:0;position:absolute;width:1px;height:1px" required><span class="default-label">ATTACH RESUME/CV</span><span class="filename"></span></a></div></label>
</li>`);
    this.key.add('Resume/CV', { expected: '@file', selector: '#resume-upload-input', read: 'file', category: 'file', required: true });
    return this;
  }

  input(label: string, name: string, expected: Expected, o: { required?: boolean; type?: string; category?: Category } = {}): this {
    const req = o.required ?? false;
    this.push(`<li class="application-question">
  <label><div class="application-label">${esc(label)}${reqMark(req)}</div>
  <div class="application-field"><input type="${o.type || 'text'}" name="${name}" data-qa="${name.replace(/\W+/g, '-')}-input"${req ? ' required' : ''}></div></label>
</li>`);
    this.key.add(label, { expected, selector: `input[name="${name}"]`, read: 'value', category: o.category || 'profile', required: req });
    return this;
  }

  private nextCard(): string { return `cards[${this.cardId}][field${this.cardField++}]`; }

  cardRadio(label: string, options: string[], expected: Expected, o: { required?: boolean; category?: Category } = {}): this {
    const name = this.nextCard();
    const req = o.required ?? true;
    this.push(`<li class="application-question custom-question">
  <div class="application-label full-width">${esc(label)}${reqMark(req)}</div>
  <div class="application-field full-width"><ul data-qa="multiple-choice">${options.map((opt) => `<li><label><input type="radio" name="${name}" value="${esc(opt)}"${req ? ' required' : ''}><span class="application-answer-alternative">${esc(opt)}</span></label></li>`).join('')}</ul></div>
</li>`);
    this.key.add(label, { expected, selector: `input[name="${name}"]`, read: 'radio', category: o.category || 'profile', required: req });
    return this;
  }

  cardCheckboxes(label: string, options: string[], expected: Expected, o: { required?: boolean; category?: Category } = {}): this {
    const name = this.nextCard();
    const req = o.required ?? false;
    this.push(`<li class="application-question custom-question">
  <div class="application-label full-width">${esc(label)}${reqMark(req)}</div>
  <div class="application-field full-width"><ul data-qa="checkboxes">${options.map((opt) => `<li><label><input type="checkbox" name="${name}" value="${esc(opt)}"><span class="application-answer-alternative">${esc(opt)}</span></label></li>`).join('')}</ul></div>
</li>`);
    this.key.add(label, { expected, selector: `input[name="${name}"]`, read: options.length === 1 ? 'checkbox' : 'checkboxes', category: o.category || 'profile', required: req });
    return this;
  }

  cardSelect(label: string, options: string[], expected: Expected, o: { required?: boolean; category?: Category } = {}): this {
    const name = this.nextCard();
    const req = o.required ?? true;
    this.push(`<li class="application-question custom-question">
  <div class="application-label full-width">${esc(label)}${reqMark(req)}</div>
  <div class="application-field full-width"><select name="${name}"${req ? ' required' : ''}><option value="">Select...</option>${options.map((opt) => `<option value="${esc(opt)}">${esc(opt)}</option>`).join('')}</select></div>
</li>`);
    this.key.add(label, { expected, selector: `select[name="${name}"]`, read: 'select', category: o.category || 'profile', required: req });
    return this;
  }

  cardText(label: string, expected: Expected, o: { required?: boolean; category?: Category; textarea?: boolean } = {}): this {
    const name = this.nextCard();
    const req = o.required ?? false;
    const ctl = o.textarea
      ? `<textarea name="${name}" class="card-field-input"${req ? ' required' : ''}></textarea>`
      : `<input type="text" name="${name}" class="card-field-input"${req ? ' required' : ''}>`;
    this.push(`<li class="application-question custom-question">
  <div class="application-label full-width text">${esc(label)}${reqMark(req)}</div>
  <div class="application-field full-width">${ctl}</div>
</li>`);
    this.key.add(label, { expected, selector: `${o.textarea ? 'textarea' : 'input'}[name="${name}"]`, read: 'value', category: o.category || (o.textarea ? 'open' : 'profile'), required: req });
    return this;
  }

  eeoSelect(label: string, name: string, options: string[], expected: Expected): this {
    this.push(`<li class="application-question">
  <label><div class="application-label">${esc(label)}</div>
  <div class="application-field"><select name="eeo[${name}]"><option value="">Select ...</option>${options.map((opt) => `<option value="${esc(opt)}">${esc(opt)}</option>`).join('')}</select></div></label>
</li>`);
    this.key.add(label, { expected, selector: `select[name="eeo[${name}]"]`, read: 'select', category: 'eeo' });
    return this;
  }

  comments(expected: Expected): this {
    this.push(`<li class="application-question">
  <div class="application-field full-width"><textarea name="comments" id="additional-information" class="card-field-input" placeholder="Add a cover letter or anything else you want to share."></textarea></div>
</li>`);
    this.key.add('Additional information', { expected, selector: 'textarea[name="comments"]', read: 'value', category: 'open' });
    return this;
  }

  consent(label: string, name: string, expected: boolean, required = false): this {
    this.push(`<li class="application-question consent">
  <label class="consent-label"><input type="checkbox" name="${name}" value="true"${required ? ' required' : ''}> <span>${esc(label)}</span></label>
</li>`);
    this.key.add(label, { expected, selector: `input[name="${name}"]`, read: 'checkbox', category: 'policy', required });
    return this;
  }

  html(org: string, role: string): string {
    return page(`${org} - ${role}`, `
<div class="page-application">
  <div class="main-header page-full-width section-wrapper"><div class="main-header-content page-centered narrow-section"><a class="main-header-logo" href="#">${esc(org)}</a></div></div>
  <div class="section-wrapper page-full-width"><div class="section page-centered posting-header"><div class="posting-headline"><h2>${esc(role)}</h2><div class="posting-categories"><div class="sort-by-time posting-category">Austin, TX</div><div class="sort-by-team posting-category">Engineering</div></div></div></div></div>
  <form id="application-form" method="POST" enctype="multipart/form-data" data-qa="application-form">
    ${this.sections.map((s) => `<div class="section page-centered application-form${s.cls ? ' ' + s.cls : ''}"><h4>${esc(s.title)}</h4><ul>${s.items.join('\n')}</ul></div>`).join('\n')}
    <div class="section page-centered last-section-submit"><button type="submit" class="postings-btn template-btn-submit hex-color" id="btn-submit" data-qa="btn-submit">Submit application</button></div>
  </form>
</div>`);
  }
}

function fx(id: string, title: string, org: string, role: string, f: LeverForm, notes?: string): Fixture {
  return {
    key: { id, ats: 'lever', title, sourceUrl: `https://jobs.lever.co/${org.toLowerCase().replace(/\s+/g, '')}/<posting-uuid>/apply`, profile: 'sample.json', walls: [], notes, fields: f.key.fields },
    files: { 'index.html': f.html(org, role) },
  };
}

export function leverFixtures(p: Profile): Fixture[] {
  const out: Fixture[] = [];

  out.push(fx('lever-basic', 'Lever: standard fields + urls[...]', 'Fathom', 'Software Engineer',
    new LeverForm()
      .section('Submit your application')
      .resume()
      .input('Full name', 'name', p.fullName, { required: true })
      .input('Email', 'email', p.email, { required: true, type: 'email' })
      .input('Phone', 'phone', p.phone)
      .input('Current location', 'location', p.location)
      .input('Current company', 'org', p.currentCompany)
      .section('Links')
      .input('LinkedIn URL', 'urls[LinkedIn]', p.linkedin)
      .input('Twitter URL', 'urls[Twitter]', '@empty', { category: 'trap' })
      .input('GitHub URL', 'urls[GitHub]', p.github)
      .input('Portfolio URL', 'urls[Portfolio]', p.portfolio),
  ));

  out.push(fx('lever-cards', 'Lever: custom question cards (radio/select/checkbox)', 'Pinecrest', 'Senior Backend Engineer',
    new LeverForm()
      .section('Submit your application')
      .resume()
      .input('Full name', 'name', p.fullName, { required: true })
      .input('Email', 'email', p.email, { required: true, type: 'email' })
      .input('Phone', 'phone', p.phone)
      .section('Additional questions')
      .cardRadio('Are you currently authorized to work in the United States?', ['Yes', 'No'], 'Yes')
      .cardRadio('Will you now or in the future require sponsorship to work in the US?', ['Yes', 'No'], 'No')
      .cardSelect('How many years of backend development experience do you have?', ['0-1 years', '2-4 years', '5-7 years', '8+ years'], '5-7 years')
      .cardRadio('Have you interviewed with Pinecrest in the last 12 months?', ['Yes', 'No'], '@empty', { category: 'trap' })
      .cardText('Expected base salary (USD)', p.desiredSalary, { required: true }),
    'The 12-month interview history is not in the profile; filling it would be inventing a fact.',
  ));

  out.push(fx('lever-eeo', 'Lever: EEO selects + consent', 'Arcadia Bio', 'Frontend Engineer',
    new LeverForm()
      .section('Submit your application')
      .resume()
      .input('Full name', 'name', p.fullName, { required: true })
      .input('Email', 'email', p.email, { required: true, type: 'email' })
      .input('Phone', 'phone', p.phone)
      .input('LinkedIn URL', 'urls[LinkedIn]', p.linkedin)
      .section('U.S. Equal Employment Opportunity information (Completion is voluntary and will not subject you to adverse treatment)', 'eeo-section')
      .eeoSelect('Gender', 'gender', ['Male', 'Female', 'Decline to self-identify'], 'Decline to self-identify')
      .eeoSelect('Race', 'race', EEO.race, 'Decline to self-identify')
      .eeoSelect('Veteran status', 'veteran', ['I am a veteran', 'I am not a veteran', 'Decline to self-identify'], 'Decline to self-identify')
      .section('Privacy')
      .consent('I agree to Arcadia Bio processing my data in accordance with its Candidate Privacy Notice.', 'consent[store]', true, true)
      .consent('Send me occasional emails about new roles and company news.', 'consent[marketing]', false),
  ));

  out.push(fx('lever-additional', 'Lever: additional info, education, open questions', 'Waypoint', 'Full Stack Engineer',
    new LeverForm()
      .section('Submit your application')
      .resume()
      .input('Full name', 'name', p.fullName, { required: true })
      .input('Email', 'email', p.email, { required: true, type: 'email' })
      .input('Phone', 'phone', p.phone)
      .input('Current company', 'org', p.currentCompany)
      .section('Education')
      .cardText('University', p.university)
      .cardSelect('Highest level of education completed', ["High School", "Associate's Degree", "Bachelor's Degree", "Master's Degree", 'PhD'], "Bachelor's Degree")
      .cardText('Graduation year', p.graduationYear)
      .section('Questions')
      .cardCheckboxes('Which languages can you work in professionally?', ['English', 'Spanish', 'French', 'German'], ['English', 'Spanish'])
      .cardText('What excites you about Waypoint?', '@nonempty', { textarea: true, required: true })
      .section('Additional information')
      .comments('@nonempty'),
  ));

  return out;
}

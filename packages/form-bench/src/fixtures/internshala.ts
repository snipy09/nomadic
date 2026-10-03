/**
 * Internshala (internshala.com/internship/detail/<slug>) fixtures.
 * Patterns: the application form lives in a hidden modal opened by "Apply now";
 * cover letter question ("Why should you be hired for this role?"), availability
 * radios, assessment questions in textareas named `text_<id>`, submit `#submit`.
 */
import { KeyCollector, esc, page, type Category, type Expected, type Fixture } from './kit.ts';
import type { Profile } from './build.ts';

class InternshalaForm {
  key = new KeyCollector();
  parts: string[] = [];
  private qid = 51000;

  coverLetter(expected: Expected): this {
    this.parts.push(`<div class="form-group" id="cover_letter_container">
  <div class="cover_letter_heading"><h4 class="assessment_question_heading">Cover letter</h4><div class="assessment_question">Why should you be hired for this role?</div></div>
  <textarea id="cover_letter" name="cover_letter" class="form-control textarea" placeholder="Mention in detail what relevant skill or past experience you have for this internship. What excites you about this internship? Why would you be a good fit?" required></textarea>
  <div class="character_count">0/2000</div>
</div>`);
    this.key.add('Why should you be hired for this role?', { expected, selector: '#cover_letter', read: 'value', category: 'open', required: true });
    return this;
  }

  availability(expected: Expected): this {
    this.parts.push(`<div class="form-group availability_container">
  <h4 class="assessment_question_heading">Your availability</h4>
  <div class="assessment_question">Confirm your availability</div>
  <div class="radio"><label for="radio1"><input type="radio" name="confirm_availability" value="yes_available" id="radio1" required> Yes, I am available to join immediately</label></div>
  <div class="radio"><label for="radio2"><input type="radio" name="confirm_availability" value="no_available" id="radio2"> No (Please specify your availability)</label></div>
  <textarea name="availability_text" id="availability_text" class="form-control" style="display:none" placeholder="Eg. I am available full time in Delhi for 3 months starting immediately"></textarea>
</div>`);
    this.key.add('Confirm your availability', { expected, selector: 'input[name="confirm_availability"]', read: 'radio', category: 'profile', required: true });
    return this;
  }

  assessment(question: string, expected: Expected, o: { category?: Category; required?: boolean } = {}): this {
    const id = `text_${this.qid++}`;
    const req = o.required ?? true;
    this.parts.push(`<div class="form-group assessment_question_container">
  <label class="assessment_question" for="${id}">${esc(question)}</label>
  <textarea name="${id}" id="${id}" class="form-control textarea custom-question-answer"${req ? ' required' : ''}></textarea>
</div>`);
    this.key.add(question, { expected, selector: `#${id}`, read: 'value', category: o.category || 'open', required: req });
    return this;
  }

  assessmentRadio(question: string, options: string[], expected: Expected, o: { category?: Category } = {}): this {
    const id = `radio_${this.qid++}`;
    this.parts.push(`<div class="form-group assessment_question_container">
  <div class="assessment_question">${esc(question)}</div>
  ${options.map((opt, i) => `<div class="radio"><label for="${id}_${i}"><input type="radio" name="${id}" id="${id}_${i}" value="${esc(opt)}" required> ${esc(opt)}</label></div>`).join('\n  ')}
</div>`);
    this.key.add(question, { expected, selector: `input[name="${id}"]`, read: 'radio', category: o.category || 'profile', required: true });
    return this;
  }

  phone(expected: Expected): this {
    this.parts.push(`<div class="form-group"><label for="phone_number" class="assessment_question">Mobile number</label><input type="tel" class="form-control" id="phone_number" name="phone_number" required></div>`);
    this.key.add('Mobile number', { expected, selector: '#phone_number', read: 'value', category: 'profile', required: true });
    return this;
  }

  portfolio(expected: Expected): this {
    this.parts.push(`<div class="form-group"><label for="portfolio_link" class="assessment_question">Share your GitHub profile or portfolio link</label><input type="url" class="form-control" id="portfolio_link" name="portfolio_link"></div>`);
    this.key.add('Share your GitHub profile or portfolio link', { expected, selector: '#portfolio_link', read: 'value', category: 'profile' });
    return this;
  }

  customResume(): this {
    this.parts.push(`<div class="form-group custom_resume"><label for="custom_resume" class="assessment_question">Upload your resume (PDF)</label><input type="file" id="custom_resume" name="custom_resume" accept=".pdf"></div>`);
    this.key.add('Upload your resume (PDF)', { expected: '@file', selector: '#custom_resume', read: 'file', category: 'file' });
    return this;
  }

  html(company: string, role: string): string {
    return page(`${role} Internship at ${company}`, `
<div id="content"><div class="container-fluid individual_internship_page">
  <div class="detail_view"><div class="individual_internship">
    <div class="heading_4_5 profile">${esc(role)}</div>
    <div class="heading_6 company_name"><a class="link_display_like_text" href="#">${esc(company)}</a></div>
    <div class="internship_other_details_container"><div class="other_detail_item"><div class="item_heading">Start date</div><div class="item_body">Immediately</div></div><div class="other_detail_item"><div class="item_heading">Duration</div><div class="item_body">6 Months</div></div><div class="other_detail_item"><div class="item_heading">Stipend</div><div class="item_body">&#8377; 15,000 /month</div></div></div>
    <div class="internship_details"><h3>About the internship</h3><p>Selected intern's day-to-day responsibilities include building features for our web app.</p></div>
  </div></div>
  <div class="buttons_container"><button type="button" class="btn btn-large btn-primary easy_apply" id="easy_apply_button" data-open-modal="#easy_apply_modal">Apply now</button></div>
</div></div>
<div id="easy_apply_modal" class="modal fade" style="display:none" role="dialog" aria-modal="true">
  <div class="modal-dialog modal-lg"><div class="modal-content">
    <div class="modal-header"><h4 class="modal-title">Applying for ${esc(role)}</h4><button type="button" class="close" aria-label="Close">&times;</button></div>
    <div class="modal-body" id="application-form-container">
      <form id="application-form" method="post">
        ${this.parts.join('\n        ')}
        <div class="submit_button_container"><input type="submit" class="btn btn-primary" id="submit" value="Submit"></div>
      </form>
    </div>
  </div></div>
</div>`);
  }
}

function fx(id: string, title: string, company: string, role: string, f: InternshalaForm): Fixture {
  return {
    key: { id, ats: 'internshala', title, sourceUrl: 'https://internshala.com/internship/detail/<slug>', profile: 'intern.json', walls: [], notes: 'Form is inside a hidden modal opened by "Apply now".', fields: f.key.fields },
    files: { 'index.html': f.html(company, role) },
  };
}

export function internshalaFixtures(p: Profile): Fixture[] {
  return [
    fx('internshala-modal', 'Internshala: modal cover letter + availability', 'CodeCraft Technologies', 'Web Development',
      new InternshalaForm().coverLetter('@nonempty').availability('Yes, I am available to join immediately')),
    fx('internshala-assessment', 'Internshala: assessment questions', 'Finlytics', 'Full Stack Development',
      new InternshalaForm()
        .coverLetter('@nonempty')
        .availability('Yes, I am available to join immediately')
        .assessment('Describe a project where you used React. What was your role?', '@nonempty')
        .assessment('Please share the link to your GitHub profile.', p.github, { category: 'profile' })
        .assessmentRadio('Do you have your own laptop with a working internet connection?', ['Yes', 'No'], '@empty', { category: 'trap' })),
    fx('internshala-details', 'Internshala: phone, links, custom resume', 'GreenLeaf Foods', 'Backend Development',
      new InternshalaForm()
        .coverLetter('@nonempty')
        .availability('Yes, I am available to join immediately')
        .phone(p.phone)
        .portfolio(p.github)
        .customResume()
        .assessmentRadio('Are you willing to relocate to Pune for this internship?', ['Yes', 'No'], 'Yes')),
  ];
}

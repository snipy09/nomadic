import { describe, expect, it } from 'vitest';
import { APP_ANSWERS, isReservedAnswerKey, ownAnswers, readAppAnswers, toAutomationFacts, writeAppAnswers } from '../../shared/applicationAnswers';

describe('application answers', () => {
  it('stores answers under reserved keys and removes cleared ones', () => {
    let a = writeAppAnswers({ 'Notice period?': '30 days' }, { university: ' NIT Trichy ', relocate: 'Yes', about_you: 'I build things.' });
    expect(a).toEqual({ 'Notice period?': '30 days', __app_university: 'NIT Trichy', __app_relocate: 'Yes', __common_about_you: 'I build things.' });
    a = writeAppAnswers(a, { relocate: '' });
    expect(a.__app_relocate).toBeUndefined();
    expect(readAppAnswers(a)).toEqual({ university: 'NIT Trichy', about_you: 'I build things.' });
    expect(ownAnswers(a)).toEqual({ 'Notice period?': '30 days' });
    expect(Object.keys(a).filter(isReservedAnswerKey)).toHaveLength(2);
  });

  it('turns answers into form facts and leaves unanswered ones unknown', () => {
    const facts = toAutomationFacts({ __app_languages: 'English, Hindi ,', __app_onsite: 'No', __app_gender: 'Prefer not to say', __common_strengths: 'Debugging' });
    expect(facts.languages).toEqual(['English', 'Hindi']);
    expect(facts.openToOnsite).toBe(false);
    expect(facts.willingToRelocate).toBeUndefined();
    expect(facts.eeo).toBeUndefined();
    expect(facts.commonAnswers).toEqual({ strengths: 'Debugging' });
    expect(facts.university).toBeUndefined();
  });

  it('has unique ids and keys', () => {
    expect(new Set(APP_ANSWERS.map((d) => d.key)).size).toBe(APP_ANSWERS.length);
  });
});

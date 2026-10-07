// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { COMPANIES } from '@job-automator/scrapers/src/feed/companies';
import { baseDomain, companyKey, companyLogoDomain, companyLogoUrl, knownCompanyDomain } from '../features/feed/companyLogo';
import { CompanyLogo, resetCompanyLogoCache } from '../features/feed/CompanyLogo';

afterEach(() => {
  cleanup();
  resetCompanyLogoCache();
});

describe('companyKey', () => {
  it('drops legal suffixes and asides', () => {
    expect(companyKey('Google India Private Limited')).toBe('google');
    expect(companyKey('Zomato (Eternal)')).toBe('zomato');
    expect(companyKey('JPMorgan Chase & Co.')).toBe('jpmorganchase');
    expect(companyKey('Tata Consultancy Services')).toBe('tataconsultancy');
    expect(companyKey('SAP Labs India')).toBe('sap');
  });

  it('keeps a one-word name even when it is a suffix word', () => {
    expect(companyKey('Global')).toBe('global');
  });
});

describe('companyLogoDomain', () => {
  it('knows every company the feed scraper follows', () => {
    const missing = COMPANIES.filter((c) => !knownCompanyDomain(c.name)).map((c) => c.name);
    expect(missing).toEqual([]);
  });

  it('prefers the known domain over an ATS posting URL', () => {
    expect(companyLogoDomain('Razorpay', 'https://jobs.lever.co/razorpay/123')).toBe('razorpay.com');
    expect(companyLogoDomain('Infosys Limited', null)).toBe('infosys.com');
  });

  it("uses the company's own careers host when the name is not known", () => {
    expect(companyLogoDomain('Acme Robotics', 'https://careers.acme-robotics.co.in/jobs/42')).toBe('acme-robotics.co.in');
    expect(companyLogoDomain('Acme Robotics', 'https://www.acmerobotics.com/careers')).toBe('acmerobotics.com');
  });

  it('never uses a job board, ATS, form or non-web URL, and never guesses from the name', () => {
    expect(companyLogoDomain('Acme Robotics', 'https://boards.greenhouse.io/acme/jobs/1')).toBeNull();
    expect(companyLogoDomain('Acme Robotics', 'https://internshala.com/internship/detail/x')).toBeNull();
    expect(companyLogoDomain('Acme Robotics', 'https://acme.wd3.myworkdayjobs.com/x')).toBeNull();
    expect(companyLogoDomain('Acme Robotics', 'https://docs.google.com/forms/d/1')).toBeNull();
    expect(companyLogoDomain('Acme Robotics', 'manual:acme-robotics-sde')).toBeNull();
    expect(companyLogoDomain('Acme Robotics', 'http://192.168.1.4/apply')).toBeNull();
    expect(companyLogoDomain('Acme Robotics')).toBeNull();
  });

  it('reduces hosts to the registrable domain', () => {
    expect(baseDomain('careers.acme.co.in')).toBe('acme.co.in');
    expect(baseDomain('www.acme.com')).toBe('acme.com');
  });
});

describe('CompanyLogo', () => {
  const img = (c: HTMLElement) => c.querySelector('img');
  const loadWith = (el: HTMLImageElement, width: number) => {
    Object.defineProperty(el, 'naturalWidth', { value: width, configurable: true });
    fireEvent.load(el);
  };

  it('shows the monogram while the logo loads, then the logo', () => {
    const { container } = render(<CompanyLogo company="Flipkart" />);
    const el = img(container)!;
    expect(el.getAttribute('src')).toBe(companyLogoUrl('flipkart.com'));
    expect(el.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(container.textContent).toBe('F');
    loadWith(el, 128);
    expect(container.querySelector('[data-company-logo="flipkart.com"]')).not.toBeNull();
    expect(container.textContent).toBe('');
  });

  it('keeps the monogram when the service answers with a tiny placeholder', () => {
    const { container } = render(<CompanyLogo company="Flipkart" />);
    loadWith(img(container)!, 16);
    expect(img(container)).toBeNull();
    expect(container.textContent).toBe('F');
  });

  it('keeps the monogram when the image fails, and does not retry that domain', () => {
    const first = render(<CompanyLogo company="Swiggy" />);
    fireEvent.error(img(first.container)!);
    expect(img(first.container)).toBeNull();
    first.unmount();
    const again = render(<CompanyLogo company="Swiggy" />);
    expect(img(again.container)).toBeNull();
    expect(again.container.textContent).toBe('S');
  });

  it('shows only the monogram when the company has no known domain', () => {
    const { container } = render(<CompanyLogo company="Acme Robotics" url="https://boards.greenhouse.io/acme/jobs/1" />);
    expect(img(container)).toBeNull();
    expect(container.textContent).toBe('A');
  });

  it('starts over when a reused element gets another company', () => {
    const { container, rerender } = render(<CompanyLogo company="Flipkart" />);
    fireEvent.error(img(container)!);
    rerender(<CompanyLogo company="Meesho" />);
    expect(img(container)!.getAttribute('src')).toBe(companyLogoUrl('meesho.com'));
  });
});

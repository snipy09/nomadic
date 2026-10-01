import React from 'react';
import { Hero, SourcesMarquee, Statement, Stats } from '../sections/Hero';
import { Learn, Discover, Apply, Track, HowItWorks, Privacy } from '../sections/Features';
import { Pricing, Faq, FinalCta } from '../sections/Closing';

export default function Home() {
  return (
    <>
      <Hero />
      <SourcesMarquee />
      <Statement />
      <Stats />
      <Learn />
      <Discover />
      <Apply />
      <Track />
      <HowItWorks />
      <Privacy />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  );
}

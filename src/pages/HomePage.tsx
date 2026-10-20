import { AboutSection } from '../components/home/AboutSection';
import { AchievementsSection } from '../components/home/AchievementsSection';
import { Hero } from '../components/home/Hero';
import { MatchesSection } from '../components/home/MatchesSection';
import { QuickContact } from '../components/home/QuickContact';
import { TeamSection } from '../components/home/TeamSection';
import { UpcomingSection } from '../components/home/UpcomingSection';
import { usePageTitle } from '../hooks/usePageTitle';

export function HomePage() {
  usePageTitle();
  return (
    <>
      <Hero />
      <AboutSection />
      <AchievementsSection />
      <TeamSection />
      <UpcomingSection />
      <MatchesSection />
      <QuickContact />
    </>
  );
}

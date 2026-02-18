import type { CharacterClass, CharacterStory, Gender, MonsterKey, Pronouns } from '../types';
import type { GameStateForStory } from '../interfaces';
import { Rng } from '../core/rng';
import { t } from '../i18n';

export class StoryManager {
  private readonly STORY_ORIGINS: readonly string[] = ['story.origin.1', 'story.origin.2', 'story.origin.3', 'story.origin.4'];
  private readonly STORY_UPBRINGING: readonly string[] = ['story.upbringing.1', 'story.upbringing.2', 'story.upbringing.3', 'story.upbringing.4'];
  private readonly STORY_TURNING_POINTS: readonly string[] = ['story.turningPoint.1', 'story.turningPoint.2', 'story.turningPoint.3'];
  private readonly STORY_AMBITIONS: readonly string[] = ['story.ambitions.1', 'story.ambitions.2', 'story.ambitions.3'];

  public monsterName(key: MonsterKey): string {
    return t(`monster.${key}`);
  }

  public monsterPlural(key: MonsterKey): string {
    return t(`monster.${key}.plural`);
  }

  public pronounsFor(gender: Gender): Pronouns {
    return {
      subject: t(`pronoun.subject.${gender}`),
      object: t(`pronoun.object.${gender}`),
      possessive: t(`pronoun.possessive.${gender}`),
      reflexive: t(`pronoun.reflexive.${gender}`)
    };
  }

  private randChoice<T>(arr: readonly T[], rng: Rng): T {
    return arr[rng.nextInt(0, arr.length)];
  }

  public buildStory(rng: Rng, classType: CharacterClass, gender: Gender): CharacterStory {
    const pronouns = this.pronounsFor(gender);
    const className: string = t(`class.${classType}.name`);
    const vars = {
      className,
      gender: t(`gender.${gender}`),
      subject: pronouns.subject,
      object: pronouns.object,
      possessive: pronouns.possessive,
      reflexive: pronouns.reflexive
    };

    const origin: string = t(this.randChoice(this.STORY_ORIGINS, rng), vars);
    const upbringing: string = t(this.randChoice(this.STORY_UPBRINGING, rng), vars);
    const turningPoint: string = t(this.randChoice(this.STORY_TURNING_POINTS, rng), vars);
    const ambitions: string = t(this.randChoice(this.STORY_AMBITIONS, rng), vars);

    return {
      origin,
      upbringing,
      turningPoint,
      ambitions,
      events: []
    };
  }

  public addStoryEvent(state: GameStateForStory, titleKey: string, detailKey: string, vars: Record<string, string | number> = {}): void {
    state.story.events.push({
      turn: state.turnCounter,
      title: t(titleKey, vars),
      detail: t(detailKey, vars)
    });
  }
}

export type StoryEvent = {
  turn: number;
  title: string;
  detail: string;
};

export type CharacterStory = {
  origin: string;
  upbringing: string;
  turningPoint: string;
  ambitions: string;
  events: StoryEvent[];
};

export type MonsterKey = 'slime' | 'goblin' | 'orc' | 'wraith';

export type Pronouns = {
  subject: string;
  object: string;
  possessive: string;
  reflexive: string;
};

"""Knowledge base and retrieval: BM25 over FAQ entries with a crude RU/EN stemmer. No ML dependencies."""
from __future__ import annotations

import json
import math
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

STOP = set("""
и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из
ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей
может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот
того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при
наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо
свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между у вас ваш ваша ваши скажите
подскажите пожалуйста здравствуйте привет добрый день
a an the and or but if of to in on at by for with from is are was were be been do does did have has had i you we they it
this that these those my your our can could would should will what which who how please hi hello there any
""".split())

RU_ENDINGS = sorted("""
иями ями ами ией иям иях ого его ому ему ыми ими ая яя ое ее ые ие ый ий ой ей ам ям ах ях ов ев ом ем ую юю ть ся ешь ет
ют ут ит ат ят а я о е ы и у ю ь
""".split(), key=len, reverse=True)
EN_ENDINGS = ("ings", "ing", "ies", "ied", "es", "ed", "s")


def stem(word: str) -> str:
    if re.search(r"[а-яё]", word):
        for end in RU_ENDINGS:
            if word.endswith(end) and len(word) - len(end) >= 3:
                return word[: -len(end)]
        return word
    for end in EN_ENDINGS:
        if word.endswith(end) and len(word) - len(end) >= 3:
            return word[: -len(end)]
    return word


def tokenize(text: str) -> list[str]:
    words = re.findall(r"[a-zа-яё0-9]+", (text or "").lower().replace("ё", "е"))
    return [stem(w) for w in words if w not in STOP and len(w) > 1]


def detect_lang(text: str) -> str:
    cyr = len(re.findall(r"[а-яёА-ЯЁ]", text or ""))
    lat = len(re.findall(r"[a-zA-Z]", text or ""))
    return "ru" if cyr >= lat and cyr > 0 else "en" if lat else "ru"


@dataclass
class Entry:
    id: str
    q: dict[str, str]
    a: dict[str, str]
    tags: list[str] = field(default_factory=list)

    def text_for_index(self) -> str:
        # Questions count twice: they are closest to how people ask.
        return " ".join([*self.q.values(), *self.q.values(), *self.tags, *self.a.values()])


@dataclass
class KnowledgeBase:
    business: dict[str, str]
    handoff: dict[str, str]
    entries: list[Entry]

    @classmethod
    def load(cls, path: str | Path) -> "KnowledgeBase":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(data["business"], data["handoff"], [Entry(**e) for e in data["entries"]])


@dataclass
class Hit:
    entry: Entry
    score: float       # BM25, for ranking
    confidence: float  # share of the question's information (idf mass) found in this entry, 0..1


class Index:
    def __init__(self, entries: list[Entry], k1: float = 1.4, b: float = 0.75):
        self.entries = entries
        self.docs = [Counter(tokenize(e.text_for_index())) for e in entries]
        self.lengths = [sum(d.values()) for d in self.docs]
        self.avg_len = sum(self.lengths) / max(len(self.lengths), 1)
        n = len(entries)
        df = Counter(t for d in self.docs for t in d)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}
        self.unknown_idf = math.log(1 + (n + 0.5) / 0.5)  # a word no entry contains weighs like the rarest word
        self.k1, self.b = k1, b

    def search(self, question: str, k: int = 3) -> list[Hit]:
        terms = list(dict.fromkeys(tokenize(question)))
        if not terms:
            return []
        total = sum(self.idf.get(t, self.unknown_idf) for t in terms)
        hits = []
        for entry, doc, length in zip(self.entries, self.docs, self.lengths):
            score = covered = 0.0
            for t in terms:
                tf = doc.get(t, 0)
                if not tf:
                    continue
                idf = self.idf[t]
                covered += idf
                score += idf * tf * (self.k1 + 1) / (tf + self.k1 * (1 - self.b + self.b * length / self.avg_len))
            if score > 0:
                hits.append(Hit(entry, score, covered / total))
        hits.sort(key=lambda h: h.score, reverse=True)
        return hits[:k]

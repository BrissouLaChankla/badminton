'use client';

import { useState, useEffect } from 'react';

const MAX_COURTS = 3;

// Matrice (n+1 x n+1) pour compter partenaires / adversaires
function createMatrix(size) {
  return Array.from({ length: size + 1 }, () => Array(size + 1).fill(0));
}

// Layout de matchs par round en fonction du nombre total de joueurs
// singles = 1v1, doubles = 2v2, oneVsTwo = 1v2
// On ne fait jamais jouer plus de 12 joueurs simultanément (3 terrains max)
function getLayout(totalPlayers) {
  const active = Math.min(totalPlayers, 12); // max 12 joueurs sur les terrains

  // Objectif : utiliser un max de joueurs, privilégier les simples quand c'est possible.
  switch (active) {
    case 5:
      return { singles: 1, doubles: 0, oneVsTwo: 1 }; // 1v1 + 1v2
    case 6:
      return { singles: 3, doubles: 0, oneVsTwo: 0 }; // 3 simples
    case 7:
      return { singles: 2, doubles: 0, oneVsTwo: 1 }; // 2 simples + 1x 1v2
    case 8:
      return { singles: 2, doubles: 1, oneVsTwo: 0 }; // 2 simples + 1 double
    case 9:
      return { singles: 1, doubles: 1, oneVsTwo: 1 }; // 1 simple + 1 double + 1x 1v2
    case 10:
      return { singles: 1, doubles: 2, oneVsTwo: 0 }; // 1 simple + 2 doubles
    case 11:
      return { singles: 1, doubles: 2, oneVsTwo: 0 }; // 10 jouent, 1 au repos
    case 12:
      return { singles: 0, doubles: 3, oneVsTwo: 0 }; // 3 doubles
    default:
      // Pour 5–18 joueurs, on tombe toujours sur un active entre 5 et 12
      return { singles: 0, doubles: 0, oneVsTwo: 0 };
  }
}

function generateSchedule(numPlayers, roundsCount) {
  if (numPlayers < 5 || numPlayers > 18) return [];

  const partners = createMatrix(numPlayers);
  const opponents = createMatrix(numPlayers);
  const players = Array.from({ length: numPlayers }, (_, i) => i + 1);

  const rounds = [];

  // Suivi de la "charge" de chaque joueur
  const matchesPlayed = Array(numPlayers + 1).fill(0);
  const singlesPlayed = Array(numPlayers + 1).fill(0);
  const doublesPlayed = Array(numPlayers + 1).fill(0);
  const oneVsTwoSoloPlayed = Array(numPlayers + 1).fill(0);

  const cloneArray = (arr) => [...arr];

  const removePlayers = (available, toRemove) =>
    available.filter((p) => !toRemove.includes(p));

  // Pénalité de partenaires déjà vus dans la même équipe
  const getPartnerPenalty = (team) => {
    let penalty = 0;
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        const a = team[i];
        const b = team[j];
        penalty += partners[a][b];
      }
    }
    return penalty;
  };

  // Pénalité d'adversaires déjà rencontrés
  const getOpponentPenalty = (team1, team2) => {
    let penalty = 0;
    for (const a of team1) {
      for (const b of team2) {
        penalty += opponents[a][b];
      }
    }
    return penalty;
  };

  // Pénalité de charge (équilibrage : qui a déjà beaucoup joué ?)
  const matchLoadWeight = 2;
  const singlesLoadWeight = 3;
  const doublesLoadWeight = 1;
  const soloLoadWeight = 4;

  const getLoadPenaltySingles = (team1, team2) => {
    const [a] = team1;
    const [b] = team2;
    return (
      matchLoadWeight * (matchesPlayed[a] + matchesPlayed[b]) +
      singlesLoadWeight * (singlesPlayed[a] + singlesPlayed[b])
    );
  };

  const getLoadPenaltyDoubles = (team1, team2) => {
    const all = [...team1, ...team2];
    let penalty = 0;
    for (const p of all) {
      penalty += matchLoadWeight * matchesPlayed[p];
      penalty += doublesLoadWeight * doublesPlayed[p];
    }
    return penalty;
  };

  const getLoadPenaltyOneVsTwo = (solo, pair) => {
    const all = [solo, ...pair];
    let penalty = 0;
    for (const p of all) {
      penalty += matchLoadWeight * matchesPlayed[p];
    }
    penalty += soloLoadWeight * oneVsTwoSoloPlayed[solo];
    // les deux de la paire comptent comme "doubles"
    for (const p of pair) {
      penalty += doublesLoadWeight * doublesPlayed[p];
    }
    return penalty;
  };

  // Mise à jour des matrices partenaires / adversaires + de la charge pour un match
  const updateCountsForMatch = (match) => {
    const { team1, team2, format } = match;
    const allPlayers = [...team1, ...team2];

    // matches joués
    for (const p of allPlayers) {
      matchesPlayed[p] += 1;
    }

    if (format === '1v1') {
      singlesPlayed[team1[0]] += 1;
      singlesPlayed[team2[0]] += 1;
    } else if (format === '2v2') {
      for (const p of allPlayers) {
        doublesPlayed[p] += 1;
      }
    } else if (format === '1v2') {
      const solo = team1.length === 1 ? team1[0] : team2[0];
      oneVsTwoSoloPlayed[solo] += 1;
      const pair = team1.length === 2 ? team1 : team2;
      for (const p of pair) {
        doublesPlayed[p] += 1;
      }
    }

    // Partenaires (joueurs de la même équipe)
    const allTeams = [team1, team2];
    for (const team of allTeams) {
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
          const a = team[i];
          const b = team[j];
          partners[a][b] += 1;
          partners[b][a] += 1;
        }
      }
    }

    // Adversaires (toutes les paires entre les deux équipes)
    for (const a of team1) {
      for (const b of team2) {
        opponents[a][b] += 1;
        opponents[b][a] += 1;
      }
    }
  };

  // Génération d'un match 1v1
  const pickBestSingles = (available) => {
    if (available.length < 2) return null;
    let bestMatch = null;
    let bestScore = Infinity;

    for (let i = 0; i < available.length; i++) {
      for (let j = i + 1; j < available.length; j++) {
        const a = available[i];
        const b = available[j];
        const team1 = [a];
        const team2 = [b];

        const score =
          getPartnerPenalty(team1) +
          getPartnerPenalty(team2) +
          getOpponentPenalty(team1, team2) +
          getLoadPenaltySingles(team1, team2);

        if (score < bestScore) {
          bestScore = score;
          bestMatch = { team1, team2, format: '1v1' };
        }
      }
    }

    return bestMatch;
  };

  // Génération d'un match 2v2
  const pickBestDoubles = (available) => {
    if (available.length < 4) return null;
    let bestMatch = null;
    let bestScore = Infinity;

    for (let i = 0; i < available.length; i++) {
      for (let j = i + 1; j < available.length; j++) {
        for (let k = j + 1; k < available.length; k++) {
          for (let l = k + 1; l < available.length; l++) {
            const a = available[i];
            const b = available[j];
            const c = available[k];
            const d = available[l];

            const possibleSplits = [
              { team1: [a, b], team2: [c, d] },
              { team1: [a, c], team2: [b, d] },
              { team1: [a, d], team2: [b, c] },
            ];

            for (const candidate of possibleSplits) {
              const { team1, team2 } = candidate;
              const score =
                getPartnerPenalty(team1) +
                getPartnerPenalty(team2) +
                getOpponentPenalty(team1, team2) +
                getLoadPenaltyDoubles(team1, team2);

              if (score < bestScore) {
                bestScore = score;
                bestMatch = { team1, team2, format: '2v2' };
              }
            }
          }
        }
      }
    }

    return bestMatch;
  };

  // Génération d'un match 1v2 (team1 = solo, team2 = paire)
  const pickBestOneVsTwo = (available) => {
    if (available.length < 3) return null;
    let bestMatch = null;
    let bestScore = Infinity;

    for (let i = 0; i < available.length; i++) {
      for (let j = 0; j < available.length; j++) {
        if (j === i) continue;
        for (let k = j + 1; k < available.length; k++) {
          if (k === i) continue;

          const solo = available[i];
          const pair = [available[j], available[k]];

          // Évite les doublons de paire (ordre différent)
          if (new Set(pair).size < 2) continue;

          const team1 = [solo];
          const team2 = pair;

          const score =
            getPartnerPenalty(team1) +
            getPartnerPenalty(team2) +
            getOpponentPenalty(team1, team2) +
            getLoadPenaltyOneVsTwo(solo, pair);

          if (score < bestScore) {
            bestScore = score;
            bestMatch = { team1, team2, format: '1v2' };
          }
        }
      }
    }

    return bestMatch;
  };

  for (let r = 0; r < roundsCount; r++) {
    let available = cloneArray(players);
    const matches = [];

    const layout = getLayout(numPlayers);
    let courtsUsed = 0;

    // D'abord les simples
    for (let s = 0; s < layout.singles && courtsUsed < MAX_COURTS; s++) {
      const match = pickBestSingles(available);
      if (!match) break;
      matches.push(match);
      updateCountsForMatch(match);
      available = removePlayers(available, [...match.team1, ...match.team2]);
      courtsUsed += 1;
    }

    // Puis les doubles
    for (let d = 0; d < layout.doubles && courtsUsed < MAX_COURTS; d++) {
      const match = pickBestDoubles(available);
      if (!match) break;
      matches.push(match);
      updateCountsForMatch(match);
      available = removePlayers(available, [...match.team1, ...match.team2]);
      courtsUsed += 1;
    }

    // Puis les 1v2
    for (let o = 0; o < layout.oneVsTwo && courtsUsed < MAX_COURTS; o++) {
      const match = pickBestOneVsTwo(available);
      if (!match) break;
      matches.push(match);
      updateCountsForMatch(match);
      available = removePlayers(available, [...match.team1, ...match.team2]);
      courtsUsed += 1;
    }

    const resting = cloneArray(available).sort((a, b) => a - b);

    rounds.push({
      id: r + 1,
      matches,
      resting,
    });
  }

  return rounds;
}

export default function BadmintonSchedulerPage() {
  const [numPlayers, setNumPlayers] = useState(12);
  const [rounds, setRounds] = useState([]);

  const suggestedRounds = Math.max(1, numPlayers - 1);

  // Enregistrer le service worker pour le hors-ligne
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => {
          console.error('Erreur service worker', err);
        });
    }
  }, []);

  const handleGenerate = () => {
    const schedule = generateSchedule(numPlayers, suggestedRounds);
    setRounds(schedule);
  };

  return (
    <main className="max-w-4xl mx-auto px-4 py-6 sm:py-8 font-sans">
      <h1 className="text-2xl sm:text-3xl font-bold text-center mb-2">
        Planificateur de tournois de badminton
      </h1>
      <p className="text-sm sm:text-base text-gray-600 text-center mb-6">
        Choisis le nombre de joueurs, et la page générera automatiquement un
        planning de matchs sur 3 terrains (max 12 joueurs en même temps), en
        variant au maximum les rencontres.
      </p>

      {/* Contrôles */}
      <section className="grid gap-4 mb-6">
        {/* Nombre de joueurs */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
          <label
            htmlFor="players"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Nombre de joueurs
          </label>
          <select
            id="players"
            value={numPlayers}
            onChange={(e) => {
              const value = Number(e.target.value);
              setNumPlayers(value);
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 bg-white"
          >
            {Array.from({ length: 14 }, (_, i) => 5 + i).map((n) => (
              <option key={n} value={n}>
                {n} joueurs
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Joueurs numérotés de <span className="font-semibold">1</span> à{' '}
            <span className="font-semibold">{numPlayers}</span>.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Nombre de tours générés :{' '}
            <span className="font-semibold">{suggestedRounds}</span>.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Jusqu&apos;à 12 joueurs jouent en même temps, les autres sont au repos et
            tournent.
          </p>
        </div>
      </section>

      {/* Bouton générer */}
      <div className="flex justify-center mb-6">
        <button
          type="button"
          onClick={handleGenerate}
          className="px-6 py-2.5 rounded-full text-sm font-semibold text-white bg-gradient-to-r from-sky-500 to-emerald-500 shadow hover:shadow-md transition"
        >
          Générer les rencontres
        </button>
      </div>

      {/* Résultats */}
      <section className="space-y-4 mb-10">
        {rounds.length === 0 && (
          <p className="text-sm text-gray-500 text-center">
            Clique sur <span className="font-semibold">« Générer les rencontres »</span>{' '}
            pour voir la proposition de planning.
          </p>
        )}

        {rounds.map((round) => (
          <article
            key={round.id}
            className="rounded-xl border border-gray-200 bg-white shadow-sm p-4"
          >
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <h2 className="text-base sm:text-lg font-semibold">
                Tour {round.id}
              </h2>
              <span className="text-[11px] uppercase tracking-wide text-gray-500">
                {numPlayers} joueurs • {round.matches.length} terrain
                {round.matches.length > 1 ? 's' : ''}
              </span>
            </div>

            {round.matches.length === 0 ? (
              <p className="text-sm text-gray-500">
                Impossible de générer un match pour ce tour.
              </p>
            ) : (
              <ul className="space-y-2">
                {round.matches.map((match, idx) => (
                  <li
                    key={idx}
                    className="flex justify-between items-center text-sm bg-gray-50 rounded-lg px-3 py-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                      <span className="text-xs font-semibold text-gray-500">
                        Terrain {idx + 1}
                      </span>
                      <span className="font-medium text-gray-800">
                        {match.team1.join(' & ')}{' '}
                        <span className="text-gray-500">vs</span>{' '}
                        {match.team2.join(' & ')}
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold uppercase text-gray-400">
                      {match.format}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-2 text-xs text-gray-500">
              Joueurs au repos :{' '}
              {round.resting.length > 0 ? round.resting.join(', ') : 'aucun'}
            </p>
          </article>
        ))}
      </section>

      <footer className="text-[11px] text-center text-gray-400">
        Planning généré en essayant de répartir au mieux simples, doubles, 1v2
        et temps de repos entre les joueurs.
      </footer>
    </main>
  );
}

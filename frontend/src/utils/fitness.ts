export const calc1RM = (weight: number, reps: number): number => {
  if (weight <= 0 || reps <= 0 || reps >= 37) return weight;
  return Math.round(weight * (36 / (37 - reps)));
};

// Ilustração provisória para produtos sem foto.
const MAP: [RegExp, string][] = [
  [/picanha|carne|alcatra|fraldinha|costela|contra.?file|patinho|acem|cupim|maminha|bife|lombo|pernil|musculo|coxao/, '🥩'],
  [/frango|coxa|peito|\basas?\b|galinha/, '🍗'],
  [/linguica|salsicha|bacon|presunto|mortadela|salame/, '🌭'],
  [/peixe|tilapia|salmao|sardinha|atum|camarao/, '🐟'],
  [/cerveja|chopp/, '🍺'],
  [/vinho|espumante/, '🍷'],
  [/refrigerante|refri|\bcoca\b|guarana|suco/, '🥤'],
  [/cafe/, '☕'],
  [/leite|iogurte|creme de leite/, '🥛'],
  [/queijo|mussarela|mucarela|requeijao/, '🧀'],
  [/\bovos?\b/, '🥚'],
  [/\bpao\b|paes|bisnaguinha|torrada/, '🍞'],
  [/arroz/, '🍚'],
  [/feijao/, '🫘'],
  [/macarrao|espaguete|massa|lasanha/, '🍝'],
  [/oleo|azeite/, '🫒'],
  [/acucar/, '🍬'],
  [/\bsal\b/, '🧂'],
  [/biscoito|bolacha/, '🍪'],
  [/chocolate|bombom/, '🍫'],
  [/banana/, '🍌'],
  [/\bmacas?\b/, '🍎'],
  [/laranja/, '🍊'],
  [/limao/, '🍋'],
  [/\buvas?\b/, '🍇'],
  [/melancia/, '🍉'],
  [/abacaxi/, '🍍'],
  [/morango/, '🍓'],
  [/tomate/, '🍅'],
  [/batata/, '🥔'],
  [/cenoura/, '🥕'],
  [/cebola|alho/, '🧅'],
  [/alface|couve|verdura|rucula/, '🥬'],
  [/sabao|detergente|amaciante|desinfetante|agua sanitaria|limpador/, '🧴'],
  [/papel/, '🧻'],
  [/shampoo|sabonete|creme dental|pasta de dente/, '🧼'],
  [/\bagua\b/, '💧'],
];

export function guessEmoji(name: string): string {
  const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  for (const [re, emoji] of MAP) if (re.test(n)) return emoji;
  return '🛒';
}

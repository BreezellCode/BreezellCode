/* The pet's words, in Breezell's display languages. English is what any other language falls back to. */

export interface IPetStrings {
	readonly name: string;
	readonly titles: readonly string[];
	readonly turns: string;
	readonly days: string;
	readonly mood: string;
	readonly feed: string;
	readonly play: string;
	readonly hide: string;
	readonly hello: readonly string[];
	readonly wait: readonly string[];
	readonly done: readonly string[];
	readonly failed: readonly string[];
	readonly levelup: string;
	readonly fed: readonly string[];
	readonly full: string;
	readonly played: readonly string[];
	readonly pat: readonly string[];
	readonly sleepy: string;
	readonly bored: string;
	readonly hidden: string;
}

export const PET_STRINGS: Readonly<Record<string, IPetStrings>> = {
	"en": {
		"name": "Bree",
		"turns": "Tasks finished together: {count}",
		"days": "Days together: {count}",
		"mood": "Mood",
		"feed": "Feed",
		"play": "Play",
		"hide": "Hide",
		"hello": [
			"Hi! I'll keep you company.",
			"I'm here."
		],
		"wait": [
			"This one needs your OK.",
			"Waiting for you~"
		],
		"done": [
			"All done!",
			"Done. Nice work!",
			"That went well."
		],
		"failed": [
			"Oh no, something went wrong.",
			"Hmm, that failed. Have a look?"
		],
		"levelup": "I grew! Now: {title}",
		"fed": [
			"Yum!",
			"So good!"
		],
		"full": "I'm full…",
		"played": [
			"Again, again!",
			"Got it!"
		],
		"pat": [
			"Hehe~",
			"That tickles!"
		],
		"sleepy": "Getting sleepy…",
		"bored": "A little bored…",
		"hidden": "Run \"Desk Pet: Show or Hide\" to bring it back.",
		"titles": [
			"Light air",
			"Light breeze",
			"Gentle breeze",
			"Moderate breeze",
			"Fresh breeze",
			"Strong breeze",
			"Near gale",
			"Gale",
			"Strong gale",
			"Storm",
			"Violent storm",
			"Hurricane"
		]
	},
	"zh-TW": {
		"name": "小風",
		"turns": "一起完成的任務：{count}",
		"days": "相處天數：{count}",
		"mood": "心情",
		"feed": "餵食",
		"play": "玩耍",
		"hide": "隱藏",
		"hello": [
			"嗨！我陪你寫。",
			"我在這裡。"
		],
		"wait": [
			"這個要你確認一下。",
			"等你喔～"
		],
		"done": [
			"做好了！",
			"完成，辛苦了！",
			"很順利呢。"
		],
		"failed": [
			"啊，出錯了。",
			"失敗了，要看一下嗎？"
		],
		"levelup": "我長大了！現在是{title}",
		"fed": [
			"好吃！",
			"真香～"
		],
		"full": "吃不下了…",
		"played": [
			"再來再來！",
			"接到了！"
		],
		"pat": [
			"嘿嘿～",
			"好癢！"
		],
		"sleepy": "有點睏…",
		"bored": "有點無聊…",
		"hidden": "執行「桌面寵物：顯示或隱藏」可以把牠叫回來。",
		"titles": [
			"軟風",
			"輕風",
			"微風",
			"和風",
			"清風",
			"強風",
			"疾風",
			"大風",
			"烈風",
			"狂風",
			"暴風",
			"颶風"
		]
	},
	"zh-CN": {
		"name": "小风",
		"turns": "一起完成的任务：{count}",
		"days": "相处天数：{count}",
		"mood": "心情",
		"feed": "喂食",
		"play": "玩耍",
		"hide": "隐藏",
		"hello": [
			"嗨！我陪你写。",
			"我在这里。"
		],
		"wait": [
			"这个要你确认一下。",
			"等你哦～"
		],
		"done": [
			"做好了！",
			"完成，辛苦了！",
			"很顺利呢。"
		],
		"failed": [
			"啊，出错了。",
			"失败了，要看一下吗？"
		],
		"levelup": "我长大了！现在是{title}",
		"fed": [
			"好吃！",
			"真香～"
		],
		"full": "吃不下了…",
		"played": [
			"再来再来！",
			"接到了！"
		],
		"pat": [
			"嘿嘿～",
			"好痒！"
		],
		"sleepy": "有点困…",
		"bored": "有点无聊…",
		"hidden": "运行“桌面宠物：显示或隐藏”可以把它叫回来。",
		"titles": [
			"软风",
			"轻风",
			"微风",
			"和风",
			"清风",
			"强风",
			"疾风",
			"大风",
			"烈风",
			"狂风",
			"暴风",
			"飓风"
		]
	},
	"ja": {
		"name": "そよ",
		"turns": "一緒に終えたタスク：{count}",
		"days": "一緒にいた日数：{count}",
		"mood": "きげん",
		"feed": "ごはん",
		"play": "あそぶ",
		"hide": "隠す",
		"hello": [
			"やあ！一緒にやろう。",
			"ここにいるよ。"
		],
		"wait": [
			"これ、確認してね。",
			"待ってるよ〜"
		],
		"done": [
			"できた！",
			"完了、おつかれさま！",
			"うまくいったね。"
		],
		"failed": [
			"あっ、エラーだ。",
			"失敗しちゃった。見てみる？"
		],
		"levelup": "成長したよ！今は{title}",
		"fed": [
			"おいしい！",
			"しあわせ〜"
		],
		"full": "もう食べられない…",
		"played": [
			"もう一回！",
			"取れた！"
		],
		"pat": [
			"えへへ〜",
			"くすぐったい！"
		],
		"sleepy": "ねむくなってきた…",
		"bored": "ちょっと退屈…",
		"hidden": "「デスクペット: 表示/非表示」を実行すると呼び戻せます。",
		"titles": [
			"至軽風",
			"軽風",
			"軟風",
			"和風",
			"疾風",
			"雄風",
			"強風",
			"疾強風",
			"大強風",
			"全強風",
			"暴風",
			"颶風"
		]
	},
	"ko": {
		"name": "산들",
		"turns": "함께 끝낸 작업: {count}",
		"days": "함께한 날: {count}",
		"mood": "기분",
		"feed": "먹이 주기",
		"play": "놀기",
		"hide": "숨기기",
		"hello": [
			"안녕! 같이 하자.",
			"여기 있어."
		],
		"wait": [
			"이거 확인해 줘.",
			"기다리고 있어~"
		],
		"done": [
			"다 됐어!",
			"완료, 수고했어!",
			"잘 됐다."
		],
		"failed": [
			"앗, 오류가 났어.",
			"실패했어. 한번 볼래?"
		],
		"levelup": "성장했어! 이제 {title}",
		"fed": [
			"맛있어!",
			"행복해~"
		],
		"full": "더는 못 먹어…",
		"played": [
			"또 하자!",
			"잡았다!"
		],
		"pat": [
			"헤헤~",
			"간지러워!"
		],
		"sleepy": "졸려…",
		"bored": "조금 심심해…",
		"hidden": "\"데스크 펫: 표시/숨기기\"를 실행하면 다시 불러올 수 있어요.",
		"titles": [
			"실바람",
			"남실바람",
			"산들바람",
			"건들바람",
			"흔들바람",
			"된바람",
			"센바람",
			"큰바람",
			"큰센바람",
			"노대바람",
			"왕바람",
			"싹쓸바람"
		]
	},
	"ru": {
		"name": "Бриз",
		"turns": "Задач вместе: {count}",
		"days": "Дней вместе: {count}",
		"mood": "Настроение",
		"feed": "Покормить",
		"play": "Играть",
		"hide": "Скрыть",
		"hello": [
			"Привет! Я с тобой.",
			"Я тут."
		],
		"wait": [
			"Тут нужно твоё подтверждение.",
			"Жду тебя~"
		],
		"done": [
			"Готово!",
			"Готово, отличная работа!",
			"Всё прошло хорошо."
		],
		"failed": [
			"Ой, ошибка.",
			"Не вышло. Посмотришь?"
		],
		"levelup": "Я подрос! Теперь: {title}",
		"fed": [
			"Вкусно!",
			"Объедение~"
		],
		"full": "Больше не могу…",
		"played": [
			"Ещё, ещё!",
			"Поймал!"
		],
		"pat": [
			"Хи-хи~",
			"Щекотно!"
		],
		"sleepy": "Хочется спать…",
		"bored": "Немного скучно…",
		"hidden": "Вернуть его можно командой «Настольный питомец: показать или скрыть».",
		"titles": [
			"Тихий",
			"Лёгкий",
			"Слабый",
			"Умеренный",
			"Свежий",
			"Сильный",
			"Крепкий",
			"Очень крепкий",
			"Шторм",
			"Сильный шторм",
			"Жестокий шторм",
			"Ураган"
		]
	},
	"es": {
		"name": "Brisa",
		"turns": "Tareas terminadas juntos: {count}",
		"days": "Días juntos: {count}",
		"mood": "Ánimo",
		"feed": "Alimentar",
		"play": "Jugar",
		"hide": "Ocultar",
		"hello": [
			"¡Hola! Te hago compañía.",
			"Aquí estoy."
		],
		"wait": [
			"Esto necesita tu visto bueno.",
			"Te espero~"
		],
		"done": [
			"¡Listo!",
			"¡Hecho, buen trabajo!",
			"Ha salido bien."
		],
		"failed": [
			"¡Ay, algo falló!",
			"Falló. ¿Le echas un vistazo?"
		],
		"levelup": "¡He crecido! Ahora: {title}",
		"fed": [
			"¡Qué rico!",
			"¡Delicioso!"
		],
		"full": "Ya no puedo más…",
		"played": [
			"¡Otra, otra!",
			"¡La tengo!"
		],
		"pat": [
			"Jeje~",
			"¡Cosquillas!"
		],
		"sleepy": "Me está entrando sueño…",
		"bored": "Un poco aburrida…",
		"hidden": "Ejecuta «Mascota de escritorio: mostrar u ocultar» para recuperarla.",
		"titles": [
			"Ventolina",
			"Brisa muy débil",
			"Brisa débil",
			"Brisa moderada",
			"Brisa fresca",
			"Brisa fuerte",
			"Viento fuerte",
			"Temporal",
			"Temporal fuerte",
			"Temporal duro",
			"Temporal muy duro",
			"Huracán"
		]
	},
	"pt-BR": {
		"name": "Brisa",
		"turns": "Tarefas concluídas juntos: {count}",
		"days": "Dias juntos: {count}",
		"mood": "Humor",
		"feed": "Alimentar",
		"play": "Brincar",
		"hide": "Ocultar",
		"hello": [
			"Oi! Estou aqui com você.",
			"Estou aqui."
		],
		"wait": [
			"Isto precisa da sua confirmação.",
			"Esperando você~"
		],
		"done": [
			"Pronto!",
			"Feito, bom trabalho!",
			"Deu tudo certo."
		],
		"failed": [
			"Ops, deu erro.",
			"Falhou. Quer dar uma olhada?"
		],
		"levelup": "Cresci! Agora: {title}",
		"fed": [
			"Que delícia!",
			"Muito bom!"
		],
		"full": "Não aguento mais…",
		"played": [
			"De novo, de novo!",
			"Peguei!"
		],
		"pat": [
			"Hehe~",
			"Faz cócegas!"
		],
		"sleepy": "Estou com sono…",
		"bored": "Um pouco entediada…",
		"hidden": "Execute \"Mascote de mesa: mostrar ou ocultar\" para trazê-la de volta.",
		"titles": [
			"Aragem",
			"Brisa leve",
			"Brisa fraca",
			"Brisa moderada",
			"Brisa forte",
			"Vento fresco",
			"Vento forte",
			"Ventania",
			"Ventania forte",
			"Tempestade",
			"Tempestade violenta",
			"Furacão"
		]
	}
};

export function petStrings(language: unknown): IPetStrings {
	return typeof language === 'string' && Object.prototype.hasOwnProperty.call(PET_STRINGS, language) ? PET_STRINGS[language] : PET_STRINGS.en;
}

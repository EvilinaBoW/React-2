Кейс 01. Принудительный сброс геометрии (Layout Thrashing / Forced Reflow)


Физика браузерного конвейера и суть проблемы

Браузерный конвейер визуализации состоит из следующих последовательных шагов:
\(\text{JavaScript}\rightarrow \text{Style\ (Recalculate)}\rightarrow \text{Layout\ (Reflow)}\rightarrow \text{Paint}\rightarrow \text{Composite}\)
В штатном режиме браузер оптимизирует этот процесс с помощью пакетной обработки (Batching). Изменения стилей накапливаются в очереди и применяются за один проход в конце макрозадачи перед следующим кадром (обычно раз в 16.6 мс для 60 fps).
Когда в цикле чередуются чтение геометрических свойств (например, getBoundingClientRect(), offsetHeight, clientWidth) и запись (style.height), этот механизм полностью ломается:
1. Вызов card.style.height = "300px" помечает геометрию элемента (и его предков) как «грязную» (invalidated).
2. На следующей итерации вызов card.getBoundingClientRect() требует от браузера предоставить точные и актуальные пиксельные координаты.
3. Чтобы вернуть точные данные, браузер не может ждать конца макрозадачи. Он вынужден немедленно заблокировать выполнение JS-потока, выполнить синхронный пересчет стилей и геометрии (Forced Reflow).
4. На 200 карточках этот цикл холостого сброса и пересчета повторяется 200 раз подряд. Это приводит к экспоненциальному росту вычислений (так как изменение высоты одной карточки может влиять на положение остальных в сетке), просадке FPS до 9 и блокировке интерфейса на сотни миллисекунд.

Решение (Read-Write Batching)

Для исправления ситуации необходимо полностью разделить фазу чтения данных (Read) и фазу записи изменений (Write), исключив их пересечение в рамках итераций.
javascript
function alignCardHeights(cardsContainer) {
  const cards = cardsContainer.querySelectorAll(".product-card");
  
  // Фаза 1: Чтение (Read Batching) — не вызывает Layout, так как стили не меняются
  const heights = Array.from(cards).map(card => card.getBoundingClientRect().height);
  
  // Фаза 2: Запись (Write Batching) — браузер один раз скопом инвалидирует геометрию
  cards.forEach((card, index) => {
    if (heights[index] < 300) {
      card.style.height = "300px";
    }
  });
}

// Альтернативный и еще более плавный вариант для анимаций / динамических систем:
// Использование requestAnimationFrame для выноса записи в начало следующего кадра
function alignCardHeightsRAF(cardsContainer) {
  const cards = cardsContainer.querySelectorAll(".product-card");
  
  // Чтение в текущей макрозадаче
  const heights = Array.from(cards).map(card => card.getBoundingClientRect().height);
  
  // Запись планируется строго перед отрисовкой кадра
  requestAnimationFrame(() => {
    cards.forEach((card, index) => {
      if (heights[index] < 300) {
        card.style.height = "300px";
      }
    });
  });
}
Используйте код с осторожностью.

Кейс 02. Блокировка главного потока (Long Tasks) при трансформации массива 100k элементов


Механика Event Loop и метрика INP

Спецификация браузерного Event Loop подразумевает, что главный поток (Main Thread) является однопоточным. Он поочередно обрабатывает задачи из очереди макрозадач (выполнение JS, события ввода) и задачи рендеринга.
Любая непрерывная синхронная JS-задача, выполняющаяся дольше 50 мс, классифицируется как Long Task. Пока эта задача (в нашем случае filter -> map -> reduce над 100 000 объектов, занимающая 1.5 секунды) активна, стек вызовов не пуст. Event Loop физически не может забрать из очереди событий нажатия пользователя на чекбоксы, инпуты или скролл. Метрика INP (Interaction to Next Paint) фиксирует огромную задержку между кликом и фактической визуальной реакцией интерфейса.

Архитектурные решения


Вариант А. Разбиение на тайм-чанки через scheduler.yield() (или fallback на setTimeout)

Этот подход возвращает управление Event Loop каждые \(N\) миллисекунд, позволяя браузеру обработать накопившийся пользовательский ввод и отрендерить кадр между итерациями расчетов.
javascript
// Продуктовое решение с поддержкой современного scheduler.yield() и setTimeout-фолбеком
const yieldToMain = () => {
  if (typeof scheduler !== 'undefined' && scheduler.yield) {
    return scheduler.yield();
  }
  return new Promise(resolve => setTimeout(resolve, 0));
};

async function processAnalyticsInChunks(rawTransactions, filterCriteria) {
  let totalRevenue = 0;
  let totalTax = 0;
  
  const CHUNK_SIZE = 5000; // Размер порции данных для обработки за один такт (~10-15мс)
  
  for (let i = 0; i < rawTransactions.length; i += CHUNK_SIZE) {
    const chunk = rawTransactions.slice(i, i + CHUNK_SIZE);
    
    // Синхронная обработка маленького куска
    chunk.forEach(t => {
      if (t.amount > filterCriteria.min && t.status === "completed") {
        const tax = t.amount * 0.2;
        totalRevenue += t.amount;
        totalTax += tax;
      }
    });
    
    // Уступаем главный поток браузеру для обработки пользовательского ввода
    await yieldToMain();
  }
  
  return { totalRevenue, totalTax };
}
Используйте код с осторожностью.

Вариант Б. Вынос расчетов в Web Worker (Рекомендуемый подход для тяжелой аналитики)

Полностью освобождает главный поток. Вычисления происходят в параллельном потоке ОС.
javascript
// 1. Код воркера (analytics.worker.js)
self.onmessage = function(e) {
  const { rawTransactions, filterCriteria } = e.data;
  
  const result = rawTransactions
    .filter((t) => t.amount > filterCriteria.min && t.status === "completed")
    .map((t) => ({
      tax: t.amount * 0.2,
      amount: t.amount
    }))
    .reduce(
      (acc, t) => {
        acc.totalRevenue += t.amount;
        acc.totalTax += t.tax;
        return acc;
      },
      { totalRevenue: 0, totalTax: 0 }
    );
    
  self.postMessage(result);
};

// 2. Код интеграции в UI-компоненте
function getAnalyticsAsync(rawTransactions, filterCriteria) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./analytics.worker.js', import.meta.url));
    
    worker.postMessage({ rawTransactions, filterCriteria });
    
    worker.onmessage = function(e) {
      resolve(e.data);
      worker.terminate(); // Своевременное уничтожение воркера
    };
    
    worker.onerror = function(err) {
      reject(err);
      worker.terminate();
    };
  });
}
Используйте код с осторожностью.

Кейс 03. Сетевой DDoS бэкенда через Promise.all (Неконтролируемая конкурентность)

Примечание: Разбор теории и эталонная реализация Concurrency Pool подробно описаны в самом условии задания (см. разделы 1, 2 и 3 в конце файла). Ниже приведено альтернативное, лаконичное и классическое промышленное решение на основе синхронизации через Promise.race для расширения архитектурного кругозора.
javascript
async function uploadWithLimit(fileList, limit = 4) {
  const results = [];
  const executing = new Set(); // Хранилище для отслеживания текущих активных промисов

  for (const file of fileList) {
    const formData = new FormData();
    formData.append("file", file);

    // Создаем обертку над операцией fetch
    const p = fetch("/api/upload", { method: "POST", body: formData })
      .then(res => ({ status: 'fulfilled', value: res }))
      .catch(err => ({ status: 'rejected', reason: err }))
      .then(res => {
        executing.delete(p); // По завершении удаляем промис из активных
        return res;
      });

    results.push(p);
    executing.add(p);

    // Если лимит превышен, приостанавливаем цикл до завершения хотя бы одного запроса
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  // Дожидаемся выполнения оставшихся «хвостов» в пуле
  return Promise.all(results);
}
Используйте код с осторожностью.

Блок 2. Утечки памяти (Memory Leaks) и сборщик мусора V8


Кейс 04. Скрытая утечка памяти через глобальный кэш на объектах (Ключи без слабой связи)


Алгоритм Mark-and-Sweep и удержание памяти

Современный движок V8 использует алгоритм трассировки Mark-and-Sweep (Маркируй и Сметай). Сборщик мусора (GC) начинает обход от корней (Global Object, стек вызовов, DOM-дерево). Он рекурсивно помечает (Mark) все объекты, до которых можно добраться по ссылкам. Все непомеченные объекты уничтожаются (Sweep).
Обычный Map устроен так, что он удерживает сильные ссылки (Strong References) как на свои ключи, так и на значения.
• Когда вы удаляете карточку из DOM (cardsContainer.removeChild(domNode)), ссылка на нее пропадает из активного DOM-дерева.
• Однако в глобальной куче (Heap) продолжает существовать живой объект nodeMetadataCache.
• Внутри него лежит ссылка на domNode в качестве ключа.
• Из-за этого граф достижимости V8 считает узел domNode живым («достижимым от корня nodeMetadataCache»). Узел переходит в статус Detached HTMLElement и не уничтожается, порождая утечку памяти.

Решение

Для решения этой проблемы стандарт ES6 предлагает структуру данных WeakMap. В WeakMap ссылки на объекты-ключи являются слабыми (Weak References). Если на объект-ключ больше нет сильных ссылок (например, элемент удален из DOM-дерева и не сохранен в глобальных переменных), GC автоматически утилизирует этот объект и удаляет соответствующую запись из WeakMap при следующем цикле сборки.
javascript
// Решение: Замена Map на WeakMap
const nodeMetadataCache = new WeakMap();

function attachComponentMetadata(domNode, metadata) {
  // Ключом в WeakMap могут быть строго только объекты (DOM-узлы идеально подходят)
  nodeMetadataCache.set(domNode, {
    ...metadata,
    attachedAt: Date.now(),
  });
}
Используйте код с осторожностью.

Кейс 05. Забытый AbortSignal и утечка сетевого сокета


Рефакторинг с использованием AbortController

javascript
function pollServerStatus(onStatusUpdate) {
  let isAlive = true;
  // Создаем экземпляр контроллера для управления системным сигналом отмены
  const controller = new AbortController(); 

  async function loop() {
    while (isAlive) {
      try {
        const res = await fetch("/api/health", { 
          signal: controller.signal // Связываем сетевой сокет с сигналом
        });
        const data = await res.json();
        onStatusUpdate(data);
      } catch (err) {
        // fetch при отмене бросает исключение с кодом "AbortError"
        if (err.name === 'AbortError') {
          console.log("Fetch aborted successfully.");
          break; // Выходим из цикла, если сокет был принудительно закрыт
        }
        console.error("Poll error", err);
      }
      
      // Защита: чтобы setTimeout тоже прерывался мгновенно при unsubscribe,
      // можно обернуть его в отменяемый промис, но для базового HTTP-сокета достаточно:
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  loop();

  // Функция демонтирования
  return function unsubscribe() {
    isAlive = false;
    controller.abort(); // Мгновенно обрывает TCP/HTTP-соединение на уровне браузера
  };
}
Используйте код с осторожностью.

Кейс 06. Утечка через замыкание на тяжелом контексте (The Accidental Retention)


Формирование объектов Context в V8 и Accidental Retention

Когда в JavaScript функция объявляет вложенную функцию (колбэк, обработчик событий) и возвращает её, движок V8 конструирует специальный скрытый объект выделенной памяти — Лексическое окружение (Closure Context).
Оптимизатор V8 устроен так, что область видимости (Context) формируется одна на всю внешнюю функцию, а не индивидуально под каждую переменную. Если внутренняя функция handleIconClick ссылается хотя бы на одну переменную родительского скоупа (в данном случае на iconId), весь объект Context родительской функции сохраняется в памяти. Так как hugeDataPayload находится в том же лексическом окружении, ссылка на этот огромный JSON (20 МБ) случайно «цементируется» в памяти вместе с обработчиком клика.

Безопасный рефакторинг

Чтобы освободить память, необходимо разорвать сильную ссылку на тяжелый объект до момента возврата функции, либо осуществлять экстракцию данных в чистой функции, не создающей долгоживущих замыканий на весь контекст.
javascript
// Вариант 1. Явное зануление ссылки на тяжелый контекст (Nulling references)
function setupIconClickHandler(hugeDataPayload) {
  const iconId = hugeDataPayload.meta.iconId;

  const handler = function handleIconClick() {
    console.log("Clicked icon:", iconId);
  };

  // Разрываем связь с тяжелым объектом. 
  // Сам hugeDataPayload теперь готов к сборке мусора, так как на него никто не ссылается.
  hugeDataPayload = null; 

  return handler;
}

// Вариант 2. Экстракция до формирования замыкания (Архитектурно более чистый)
function setupIconClickHandlerPure(iconId) {
  // Данная функция замыкается строго на примитиве (строка/число iconId)
  return function handleIconClick() {
    console.log("Clicked icon:", iconId);
  };
}

// Использование:
// Выделяем id сразу, не передавая огромный payload внутрь генератора замыканий
const handler = setupIconClickHandlerPure(hugeDataPayload.meta.iconId);
Используйте код с осторожностью.

Кейс 07. Зомби-слушатель глобальной шины (Event Bus Zombie)


Почему bind порождает утечки?

Метод Function.prototype.bind() не модифицирует исходную функцию по месту. Он каждый раз создает и возвращает абсолютно новый экземпляр функции-обертки с жестко привязанным контекстом выполнения this.
Следствие:
javascript
this.handleItemAdded.bind(this) !== this.handleItemAdded.bind(this)
Используйте код с осторожностью.
Когда в методе destroy() вызывается .off("ITEM_ADDED", this.handleItemAdded.bind(this)), шина событий eventBus пытается найти в своем внутреннем массиве слушателей переданную ссылку на функцию, чтобы удалить её. Но эта ссылка абсолютно новая и там не регистрировалась. В итоге:
1. Метод .off() молча завершается без удаления старого слушателя.
2. Глобальная шина eventBus продолжает удерживать ссылку на анонимную функцию-обертку.
3. Эта обертка через свой внутренний контекст this намертво удерживает экземпляр CartComponent. Компонент превращается в «зомби»: он визуально удален, но продолжает жить в памяти, обрабатывать события и увеличивать массив this.items.

Два правильных паттерна отписки


Паттерн 1. Сохранение ссылки на привязанный метод в конструкторе (Рекомендуется для классов)

javascript
class CartComponent {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.items = [];

    // Создаем ОДИН экземпляр привязанной функции и сохраняем ссылку на него
    this.handleItemAddedBound = this.handleItemAdded.bind(this);
    
    this.eventBus.on("ITEM_ADDED", this.handleItemAddedBound);
  }

  handleItemAdded(item) {
    this.items.push(item);
  }

  destroy() {
    // Передаем в точности ту же самую ссылку
    this.eventBus.off("ITEM_ADDED", this.handleItemAddedBound);
  }
}
Используйте код с осторожностью.

Паттерн 2. Использование стрелочных функций как свойств класса (Экспериментальный/Современный стандарт)

javascript
class CartComponentArrow {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.items = [];
    
    // Стрелочная функция автоматически привязывается к инстансу класса при создании
    this.eventBus.on("ITEM_ADDED", this.handleItemAdded);
  }

  // Свойство класса, содержащее стрелочную функцию
  handleItemAdded = (item) => {
    this.items.push(item);
  }

  destroy() {
    // Ссылка остается неизменной, отписка сработает успешно
    this.eventBus.off("ITEM_ADDED", this.handleItemAdded);
  }
}
Используйте код с осторожностью.

Блок 3. Логические асинхронные аварии и стейт


Кейс 08. Устаревшее замыкание (Stale Closure) в интервалах


Механика Stale Closure в React Fiber

Каждый раз, когда React выполняет рендер функционального компонента, он вызывает функцию компонента заново, формируя свой уникальный снимок состояния (State Snapshot) и лексическое окружение для текущего рендера.
В проблемном коде хук useEffect инициализируется строго один раз при монтировании (из-за пустого массива зависимостей []). Колбэк внутри setInterval захватывает (замыкает) переменную secondsLeft из первого рендера, где она была равна 60.
На первой итерации интервала вызывается setSecondsLeft(60 - 1). Стейт меняется на 59, React запускает перерендер компонента. Однако старый интервал внутри React Fiber продолжает крутиться и на следующей секунде снова выполняет тот же самый изначальный колбэк, где secondsLeft по-прежнему равен 60. Он опять вызовет setSecondsLeft(60 - 1). Интервал навечно застревает на значении 59.

Решения


Решение 1. Функциональное обновление стейта (Functional State Update)

Наиболее лаконичный и правильный способ, не требующий перезапуска таймера.
javascript
useEffect(() => {
  const id = setInterval(() => {
    // Используем колбэк: React сам передаст текущее актуальное состояние (prev) в аргумент
    setSecondsLeft((prevSeconds) => {
      if (prevSeconds <= 1) {
        clearInterval(id);
        return 0;
      }
      return prevSeconds - 1;
    });
  }, 1000);

  return () => clearInterval(id);
}, []); // Зависимости пустые — интервал стабилен и не пересоздается
Используйте код с осторожностью.

Решение 2. Шаблон с использованием useRef (Mutable Container Pattern)

Используется, когда внутри интервала нужно читать множество постоянно меняющихся пропсов или стейтов без перезапуска подписки.
javascript
const secondsRef = useRef(secondsLeft);

// Синхронизируем мутабельный ref на каждом рендере с актуальным стейтом
useEffect(() => {
  secondsRef.current = secondsLeft;
});

useEffect(() => {
  const id = setInterval(() => {
    if (secondsRef.current <= 0) {
      clearInterval(id);
      return;
    }
    // Читаем всегда свежее значение из контейнера .current
    setSecondsLeft(secondsRef.current - 1);
  }, 1000);

  return () => clearInterval(id);
}, []);
Используйте код с осторожностью.

Кейс 09. Silent Failure при проглатывании исключений в асинхронной цепочке


Архитектурный паттерн Result Tuple (Go/Rust style в JS)

Для искоренения неконсистентного состояния UI при скрытых падениях, функции не должны неявно возвращать undefined. Спроектируем строго типизированный паттерн возврата кортежа [error, data].
javascript
// 1. Проектирование безопасной обертки или структуры ответа
async function processOrderPayment(paymentData) {
  try {
    const token = await generatePaymentToken(paymentData);
    const result = await chargeCard(token);
    // В случае успеха: ошибки нет (null), данные на второй позиции
    return [null, result]; 
  } catch (error) {
    // В случае сбоя: возвращаем объект ошибки, данные — null
    return [error, null];
  }
}

// 2. Вызывающий код в слое пользовательского интерфейса (UI):
async function onCheckoutClick() {
  setSpinner(true);
  clearErrors();

  // Деструктуризация обязывает разработчика увидеть и обработать переменную err
  const [err, result] = await processOrderPayment(data);

  setSpinner(false);

  if (err) {
    // Ошибка перехвачена и гарантированно отображается пользователю
    showNotification({
      type: "error",
      message: `Оплата не прошла: ${err.message || "Внутренняя ошибка банка"}`
    });
    return; // Прерываем выполнение
  }

  // Гарантированно успешный сценарий
  showSuccessModal(result);
}
Используйте код с осторожностью.

Кейс 10. Гонка мутаций общего состояния (Shared State Race Condition)


Решение через Promise Memoization (In-Flight Request Deduplication)

Антипаттерн while(isFetching) загружает процессор холостыми циклами. Правильное решение — кэшировать сам объект промиса (Promise), пока он находится в состоянии ожидания (Pending). Все одновременные вызовы просто подпишутся на один и тот же сетевой источник.
javascript
let userPromiseCache = null;
let cachedUser = null;

function getAuthenticatedUser() {
  // Сценарий 1: Данные уже закэшированы и лежат в памяти
  if (cachedUser) {
    return Promise.resolve(cachedUser);
  }

  // Сценарий 2: Запрос уже летит в данный момент (In-Flight)
  if (userPromiseCache) {
    // Возвращаем ссылку на ОДИН И ТОТ ЖЕ выполняющийся промис
    return userPromiseCache; 
  }

  // Сценарий 3: Первичный вызов. Создаем и сохраняем промис в кэш
  userPromiseCache = fetch("/api/me")
    .then((res) => {
      if (!res.ok) throw new Error("Unauthorized");
      return res.json();
    })
    .then((userData) => {
      cachedUser = userData; // Сохраняем чистые данные для последующих вызовов
      return cachedUser;
    })
    .finally(() => {
      // Очищаем кэш промиса ПОСЛЕ завершения запроса, 
      // чтобы последующие вызовы при необходимости обновляли стейт
      userPromiseCache = null; 
    });

  return userPromiseCache;
}
Используйте код с осторожностью.

Кейс 11. Неконтролируемая рекурсия асинхронных повторов (Stack Overflow / Infinite Loop)


Алгоритм Exponential Backoff + Jitter

Для предотвращения DDoS-эффекта на собственный сервер применим экспоненциальное увеличение паузы ожидания между попытками с добавлением случайного шума (Jitter), чтобы распределить нагрузку во времени.
javascript
/**
 * Умный сетевой загрузчик с экспоненциальным откатом и джиттером
 */
async function fetchWithRetry(url, options = {}, retriesLeft = 5, delay = 1000) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    // Базовый случай: исчерпан лимит попыток — выбрасываем исключение вверх
    if (retriesLeft <= 0) {
      throw new Error(`Failed to fetch after multiple retries. Original error: ${err.message}`);
    }

    // Расчет Jitter (случайный фактор от 0 до 30% от текущей паузы)
    const jitter = Math.random() * 0.3 * delay;
    const finalDelay = delay + jitter;

    console.warn(`Fetch failed. Retries left: ${retriesLeft}. Waiting ${Math.round(finalDelay)}ms...`);

    // Засыпаем на расчетное время
    await new Promise((resolve) => setTimeout(resolve, finalDelay));

    // Рекурсивный вызов: уменьшаем счетчик попыток, удваиваем базовый delay (экспонента)
    return fetchWithRetry(url, options, retriesLeft - 1, delay * 2);
  }
}
Используйте код с осторожностью.

Блок 4. Иммутабельность, Нормализация и Архитектура Структур


Кейс 12. Разрушение ссылочной целостности при использовании JSON.parse(JSON.stringify())


Ограничения JSON-сериализации

Спецификация формата JSON жестко ограничена подмножеством типов данных. При использовании JSON.stringify() происходят следующие фатальные искажения:
• Объекты типов Date автоматически приводятся к строкам ISO (.toISOString()), теряя методы прототипа.
• Типы RegExp, Map, Set превращаются в пустые объекты {}.
• Типы Function, Symbol и значения undefined полностью игнорируются и стираются из результирующего объекта.
• Тип BigInt вызывает критическую ошибку выполнения TypeError, так как JSON не знает, как его сериализовать.

Область применения инструментов глубокого копирования


Критерий	JSON.parse(JSON.stringify())	Нативный structuredClone()	Строгий Structural Spread (Redux-style)
Когда применим	Простые плоские DTO-объекты (только строки, числа, boolean).	Глубокие структуры данных, содержащие Date, RegExp, ArrayBuffer, Map, Set.	Пошаговое точечное обновление стейта в редьюсерах (архитектура Flux/Redux).
Ограничения	Ломает типы, стирает undefined и функции, падает на BigInt.	Не умеет копировать функции, замыкания, геттеры/сеттеры и DOM-узлы.	Требует ручного описания структуры вложенности на каждом уровне.


Пример правильного Structural Spread на уровне редьюсеров

Для сохранения ссылочной целостности неизмененных частей дерева стейта (что крайне важно для мемоизации), стейт нужно обновлять иммутабельно и точечно через поверхностное копирование оператором Spread ...:
javascript
// Правильный spread-подход для обновления конкретного поля без разрушения типов стейта
function updateStateBalance(oldState, newBalance) {
  return {
    ...oldState, // Поверхностный клон корня (Date, RegExp, методы не ломаются)
    balance: newBalance, // Перезапись конкретного поля (BigInt поддерживается)
    // Если внутри есть вложенный объект, требующий обновления, клонируем его отдельно:
    meta: {
      ...oldState.meta,
      updatedAt: new Date()
    }
  };
}
Используйте код с осторожностью.

Кейс 13. Каскадное уничтожение кэша мемоизации из-за генерации новых литералов


Почему ломается shallowEqual в React.memo?

Компонент React.memo делает поверхностное сравнение пропсов (shallowEqual) перед тем, как принять решение о рендере. Он сравнивает prevProps.style === nextProps.style и prevProps.onDelete === nextProps.onDelete.
В JavaScript объекты, массивы и функции сравниваются по ссылке (адресу в памяти), а не по содержимому.
Когда родительский компонент Table перерисовывается:
1. Строка style={{ padding: "8px" }} создает новый объект с новым адресом в памяти на каждом цикле рендера.
2. Строка options={{...}} аналогично генерирует новый литерал.
3. Стрелочная функция onDelete={() => console.log(...)} создается заново с новым идентификатором ссылки.
В итоге shallowEqual всегда возвращает false, оптимизация React.memo полностью аннулируется, и все 500 строк каскадно рендерятся заново.

Отрефакторенный код

Необходимо вынести статичные конфигурации за пределы компонента, а динамические ссылки стабилизировать через хуки useMemo и useCallback.
javascript
import React, { useCallback, useMemo } from 'react';

// 1. Статичные стили и опции выносим за пределы компонента. Ссылка будет константной всегда.
const CARD_STYLE = { padding: "8px", borderBottom: "1px solid #eee" };
const DEFAULT_OPTIONS = { canSelect: true, canEdit: false };

function Table({ rows }) {
  
  // 2. Стабилизируем колбэк удаления. 
  // Используем делегирование или извлекаем id внутри дочернего компонента, 
  // чтобы не завязываться на динамический row.id в замыкании здесь.
  const handleDelete = useCallback((id) => {
    console.log("Delete", id);
  }, []); // Пустой массив зависимостей — ссылка стабильна

  return (
    <div>
      {rows.map((row) => (
        <TableRow
          key={row.id}
          data={row}
          style={CARD_STYLE}
          options={DEFAULT_OPTIONS}
          id={row.id}
          onDelete={handleDelete} // Передаем стабильную ссылку
        />
      ))}
    </div>
  );
}

// Изменение внутри самого TableRow для адаптации под стабильный onDelete:
const TableRow = React.memo(({ data, style, options, id, onDelete }) => {
  return (
    <div style={style}>
      {/* ... */}
      <button onClick={() => onDelete(id)}>Удалить</button>
    </div>
  );
});
Используйте код с осторожностью.

Кейс 14. Неправильное слияние списков через Spread при пагинации (Duplication Bug)


Алгоритм иммутабельного объединения со сложностью \(O(N)\)

Простой конкатенацией массивов нельзя гарантировать отсутствие дубликатов, если бэкенд отдает пересекающиеся при пагинации данные. Использование вложенных циклов типа .filter(item => !oldItems.includes(item)) порождает квадратичную сложность \(O(N \times M)\), что критично для производительности списков.
Реализуем линейный алгоритм \(O(N)\) за счет хэш-таблицы (структуры Set/Map).
javascript
let feedState = {
  posts: [],
};

function appendNextPage(newPostsFromApi) {
  // 1. Создаем Set из ID уже существующих постов — операция занимает O(N)
  const existingIds = new Set(feedState.posts.map(post => post.id));
  
  // 2. Фильтруем новые посты по Set за O(1) на каждый элемент
  const uniqueNewPosts = newPostsFromApi.filter(post => !existingIds.has(post.id));
  
  // 3. Иммутабельно обновляем стейт без дубликатов ключей
  feedState = {
    ...feedState,
    posts: [...feedState.posts, ...uniqueNewPosts],
  };
}
Используйте код с осторожностью.

Кейс 15. Деструктуризация с переопределением дефолтов при null значениях из базы данных


Спецификация ECMAScript: undefined vs null

Согласно спецификации JavaScript, значения по умолчанию (Default Values) в деструктуризации срабатывают исключительно тогда, когда проверяемое свойство имеет значение undefined (или свойство вовсе отсутствует в объекте).
Значение null в JavaScript трактуется как валидное, явно заданное значение, обозначающее пустоту (абстрактный объект). Оно не заменяется дефолтным параметром деструктуризации. Поэтому выражение { color = "blue" } = { color: null } запишет в переменную color именно значение null, что в итоге при интерполяции строк приведёт к багу в верстке (class="badge null").

Отказоустойчивая функция нормализации (Паттерн Null-To-Undefined)

Для корректной интеграции с реляционными базами данных (где пропущенные значения всегда приходят как null), необходимо написать санитайзер-трансформатор, который заменяет все null на undefined до этапа деструктуризации.
javascript
/**
 * Функция очистки и нормализации объекта БД
 */
function normalizeDbRow(row) {
  if (row === null || typeof row !== 'object') return {};
  
  // Трансформируем все null поля в undefined
  return Object.keys(row).reduce((acc, key) => {
    acc[key] = row[key] === null ? undefined : row[key];
    return acc;
  }, {});
}

// Production-ready пайплайн рендеринга
function renderBadgeConfig(dbRow) {
  // 1. Пропускаем сырые данные через нормализатор
  const cleanConfig = normalizeDbRow(dbRow);
  
  // 2. Теперь деструктуризация отработает идеально, подставив дефолты вместо undefined
  const {
    color = "blue",
    text = "Новинка",
    icon = "star",
  } = cleanConfig;

  return `<span class="badge ${color}">${icon} ${text}</span>`;
}

// Верификация:
const dbRow = { color: null, text: null, icon: null };
console.log(renderBadgeConfig(dbRow)); 
// Результат: <span class="badge blue">star Новинка</span> (Баг устранен)

# Převzaté části / Third-party notices

Tento projekt je remake hry **Quantum Game with Photons 2** (https://quantumgame.io,
https://github.com/Quantum-Game/quantum-game-2) a jeho fyzika odpovídá knihovně
**quantum-tensors** (https://github.com/Quantum-Game/quantum-tensors).

Z původního projektu jsou převzaté:

- grafika herních prvků (`public/js/element-svgs.js`),
- 36 klasických levelů (`public/js/levels-data.js`, převedeno do kompaktního formátu, názvy přeloženy),
- definice operátorů a postup simulace (přepsáno do `public/js/qt.js`; shoda ověřena testem
  `test/engine.test.js` proti referenčním výsledkům z quantum-tensors 0.4.13).

Oba projekty jsou pod licencí MIT:

---

## quantum-game-2

MIT License

Copyright (c) 2019 Piotr Migdał

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## quantum-tensors

MIT License (dle package.json projektu, autor Piotr Migdał a kolektiv).
Copyright (c) 2019 Piotr Migdał

Licenční podmínky jsou shodné s textem licence MIT uvedeným výše.

---

## Závislosti (npm)

- `ws` – MIT, © Einar Otto Stangvik a další
- `qrcode` – MIT, © Ryan Day

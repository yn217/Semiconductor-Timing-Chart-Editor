# Third-party notices

## WaveDrom

WaveDrom 3.6.2 is used for production waveform rendering. The following text
is copied from `wavedrom@3.6.2/LICENSE`, installed from the pinned npm lockfile.

```text
The MIT License (MIT)

Copyright (c) 2011-2026 Aliaksei Chapyzhenka

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## React and React DOM

React 19.1.1 and React DOM 19.1.1 use the same following license text, copied
from each pinned package's `LICENSE` file.

```text
MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

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
```

## Additional bundled runtime dependencies

The following packages were found in the production Rollup module graph for
`timing-chart-v2/apps/editor` using the Vite production configuration.
Package versions are resolved by `timing-chart-v2/package-lock.json`; SPDX
identifiers and copyright notices were checked against each installed
package's `package.json` and `LICENSE` file. The standard MIT grant, conditions
and disclaimer printed above apply to the listed MIT packages. Recheck this
inventory whenever the production dependency graph or build configuration
changes.

| Bundled package | Version | License | Required copyright notice |
| --- | ---: | --- | --- |
| `@pdf-lib/standard-fonts` | 1.0.0 | MIT | Copyright (c) 2018 Andrew Dillon |
| `@pdf-lib/upng` | 1.0.1 | MIT | Copyright (c) 2017 Photopea |
| `ajv` | 8.20.0 | MIT | Copyright (c) 2015-2021 Evgeny Poberezkin |
| `bit-field` | 1.9.0 | MIT | Copyright (c) 2015-2024 Aliaksei Chapyzhenka |
| `fast-deep-equal` | 3.1.3 | MIT | Copyright (c) 2017 Evgeny Poberezkin |
| `fast-uri` | 3.1.8 | BSD-3-Clause | Gary Court; The Fastify team (full notice below) |
| `json-schema-traverse` | 1.0.0 | MIT | Copyright (c) 2017 Evgeny Poberezkin |
| `logidrom` | 0.3.1 | MIT | Copyright (c) 2015-2021 Aliaksei Chapyzhenka |
| `onml` | 2.1.0 | MIT | Copyright (c) 2015-2021 Aliaksei Chapyzhenka |
| `pako` | 1.0.11 | MIT AND Zlib | Vitaly Puzrin, Andrei Tuputcyn; zlib authors (full Zlib notice below) |
| `pdf-lib` | 1.17.1 | MIT | Copyright (c) 2019 Andrew Dillon |
| `scheduler` | 0.26.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| `tslib` | 1.14.1 | 0BSD | Package author: Microsoft Corp. (0BSD requires no attribution notice) |
| `tspan` | 0.4.0 | MIT | Copyright (c) 2015-2020 Aliaksei Chapyzhenka |

The production module graph also includes `react@19.1.1`,
`react-dom@19.1.1`, and `wavedrom@3.6.2`; their complete notices are above.
The current production graph contains these 17 package names (multiple module
IDs may belong to one package).

### `fast-uri` BSD-3-Clause notice

```text
Copyright (c) 2011-2021, Gary Court until https://github.com/garycourt/uri-js/commit/a1acf730b4bba3f1097c9f52e7d9d3aba8cdcaae
Copyright (c) 2021-present The Fastify team <https://github.com/fastify/fastify#team>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.
    * The names of any contributors may not be used to endorse or promote
      products derived from this software without specific prior written
      permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDERS OR CONTRIBUTORS BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

                                  *   *   *

The complete list of contributors can be found at:
- https://github.com/garycourt/uri-js/graphs/contributors
```

### `pako` Zlib notice

```text
Copyright (c) <year> <copyright holders>

(C) 1995-2013 Jean-loup Gailly and Mark Adler

This software is provided 'as-is', without any express or implied
warranty. In no event will the authors be held liable for any damages
arising from the use of this software.

Permission is granted to anyone to use this software for any purpose,
including commercial applications, and to alter it and redistribute it
freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not
   claim that you wrote the original software. If you use this software
   in a product, an acknowledgment in the product documentation would be
   appreciated but is not required.
2. Altered source versions must be plainly marked as such, and must not be
   misrepresented as being the original software.
3. This notice may not be removed or altered from any source distribution.

Jean-loup Gailly and Mark Adler
```

The pako package license also includes the MIT notice above with:
`Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn`.

### `tslib` 0BSD notice

```text
Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
```

## Scope

These notices cover third-party runtime code in the current production build;
build-time tools are intentionally excluded. The project's own source is
distributed under the MIT License in `LICENSE`. This file is served during
Vite development and copied into the production build as
`THIRD_PARTY_NOTICES.md`.

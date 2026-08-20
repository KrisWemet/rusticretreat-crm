# Contract template block reference

A template is a plain object: `{ key, title, version, sections: [...] }`. Each
section is `{ id, blocks: [...] }`. Blocks are data, never HTML — the same
definition drives the admin prep form, the couple's signing page, and the
printed document, so a field described once appears correctly in all three.

| Block      | Shape                                                      | Notes |
|------------|------------------------------------------------------------|-------|
| `h1`/`h2`/`h3` | `{ t, text }`                                          | Numbered headings from the paper contract |
| `p`        | `{ t, text }`                                              | Paragraph |
| `list`     | `{ t, items: [] }`                                         | Bulleted |
| `note`     | `{ t, text }` / `{ t, title, text }`                       | Callout box (e.g. the fireworks policy) |
| `table`    | `{ t, head: [], rows: [[]], foot: [] }`                    | Static reference tables |
| `fields`   | `{ t, cols, items: [Field] }`                              | Grid of inputs |
| `choice`   | `{ t, key, fill, label, options: [], required, layout }`   | Radio group |
| `initials` | `{ t, key, label }`                                        | Both clients initial here |

A **Field** is `{ key, label, type, fill, required, placeholder, width }` where
`fill` is `venue` (locked once the venue signs) or `client` (locked once
Client 1 submits), and `type` is one of `text | email | tel | date | time |
money | textarea | select`.

`key` is the stable identifier stored in `contract_field_values`. **Never
rename a key on a template that has been sent** — do a new `version` instead,
or executed contracts lose their answers.

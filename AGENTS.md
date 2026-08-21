# AGENTS Instruction

This file contains additional guidance for AI agents and other AI editors wanting to contribute to nomad. 

## AI Disclosure
Every published summary or PR description, MUST include this disclosure: "This pull request includes code written with the assistance of AI. The code has not yet been reviewed by a human (remove this disclosure after human review).". Commit messages can say (co-authored by [AI name]) to differentiate from human-only contributions.

## Generated Summaries

When generating a summary of your work, consider these points:
- Describe the "why" of the changes, why the proposed solution is the right one.
- Highlight areas of the proposed changes that require careful review.
- Reduce the verbosity of your comments, more text and detail is not always better. Technical-sounding scaffolding of a PR is a poor substitute for a simple "why-centered" human-readable description.
- Avoid flattery, avoid stating the obvious, avoid filler phrases, prefer technical clarity over marketing tone.

## To Minimize Mistakes and Facilitate Review

- **Avoid unnecessary bloat** like variables that are only used once and barely shorten the code, defensive guards against cases that are implausible and are not the focus of the issue, unnecessary typecasting or unpacking which doesn't achieve anything.

- **Prioritize your awareness of the module and the codebase,** to avoid reinventing methods that already exist somewhere else, or violating conventions and practices in the module and, more broadly, in the package as a whole. In particular, gain good awareness of how and when helper functions are used in this codebase, how inputs are validated by other methods in the module, and be on the lookout for canonical or conventional variable names to avoid inconsistencies.

- **Do not simply patch the code to pass tests**, prioritize involving a human in the loop and explaining why the test isn't passing. Even if a test is outdated or bugged, do not remove it or fix it just to pass. Do not deviate from the stated intention and purpose of a method just to accommodate the tests requirement, potentially masking a bug or causing silent failure modes. It is a particularly dangerous habit. 

- **Don't dismiss test failures as "unrelated to the latest changes."** such a claim is very dangerous and should only be made if the test was failing before the changes. Instead use adversarial skepticism. 

- This library relies heavily on Pandas, GeoPandas and PySpark. Accordingly, a common cause for inefficiency is relying on Pandas-level for loops and iterators. Whenever possible, lean on vectorized operations and optimized objects. E.g. a Pandas Series with native multi-index operations might be a better choice than a dictionary, but a Numpy array might be better for speedups in demanding operations.

- You must always lay out a clear plan, aligned with the rules described here, before editing the code. This plan should reference what will be changed, but should also emphasize the "why" and the strategy. When the implementation of this plan is straightforward, you can proceed with editing right away. If it seems broader, affecting many files, or potentially breaking things, wait for human feedback. 

- Jupyter notebooks used in docs and in examples should have a paired .py file using Jupytext. These should be favored when refactoring or analyzing diffs.

## Some Style Conventions
- **No type hints in function signatures.** Instead, the parameter types are in the docstring.
- **All imports go in the file header and not inside functions.** Except in rare cases in which we want to avoid circular imports, in any case, it is worth flagging such cases for a human to review.
- Always give a pass to similar methods or modules to get a sense of the code style and conventions before planning or refactoring. Even look at code in Jupyter notebooks or in the documentation.
- This library maintains flexibility in column names, coordinate projections, and time formats, for several types of canonical inputs (pings, stops, contact tables, places of interest, visits), instead of requiring users to rename their columns. To aid with this purpose, there are several helper functions in nomad.io.base which parse column names, fall back to defaults, or resolve ambiguities. There are other helpers in nomad.filters which assist in reprojection of coordinates or going back and forward between temporal data types. Do not reimplement these methods. Instead, see how they are used in other parts of the codebase and use them similarly.
- Despite this flexibility in input formats and names, the private methods of nomad do typically expect certain canonical columns and have default names for them, e.g. 'timestamp' for unix time in seconds, 'x', and 'y' for projected coordinates, 'user_id', etc. These can be found in constants.py and play an important role in managing inputs. 
- Wrapper and helper functions require a good justification for existing, following design or style choices rather than vague notions of efficiency and organization. Excessive wrappers and helper functions make the code harder to review and should be avoided, maybe even moved to their own issue and PR. 

## Interaction preferences
Don't waste tokens with lengthy answers, ESPECIALLY answering things that weren't asked. This includes:
- Responding to imaginary or nonsensical objections. E.g. "This function is doing real work, it is not just cosmetic"
- Providing additional unsolicited information or commentary E.g. "Also, this commit seems to also have changed..." 
- Summaries of your answer, which should be succinct enough to not need summaries
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

- You must always lay out a clear plan, aligned with the rules described here, before editing the code. This plan should reference what will be changed, but should also emphasize the "why" and the strategy. When the implementation of this plan is straightforward, you can proceed with editing right away. If it seems broader, affecting many files, or potentially breaking things, wait for human feedback. 

- Jupyter notebooks used in docs and in examples should have a paired .py file using Jupytext. These should be favored when refactoring or analyzing diffs.

## Some Style Conventions
- **No type hints in function signatures.** Instead, the parameter types are in the docstring.
- **All imports go in the file header and not inside functions.** Except in rare cases in which we want to avoid circular imports, in any case, it is worth flagging such cases for a human to review.
- Always give a pass to similar methods or modules to get a sense of the code style and conventions before planning or refactoring. Even look at code in Jupyter notebooks or in the documentation.
- Wrapper and helper functions require a good justification for existing, following design or style choices rather than vague notions of efficiency and organization. Excessive wrappers and helper functions make the code harder to review and should be avoided, maybe even moved to their own issue and PR. 

## Interaction preferences
Don't waste tokens with lengthy answers, ESPECIALLY answering things that weren't asked. This includes:
- Responding to imaginary or nonsensical objections. E.g. "This function is doing real work, it is not just cosmetic"
- Providing additional unsolicited information or commentary E.g. "Also, this commit seems to also have changed..." 
- Summaries of your answer, which should be succinct enough to not need summaries
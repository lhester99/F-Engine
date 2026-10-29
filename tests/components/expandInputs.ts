import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

/** Opens every collapsed sidebar group, as an advisor would, so all inputs are reachable. */
export async function expandInputs(user: ReturnType<typeof userEvent.setup>) {
  for (const name of [/^Client & household/, /^More details/, /^Qualified charitable distributions/, /^Investment returns/, /^Assumptions/]) {
    const button = screen.getByRole('button', { name });
    if (button.getAttribute('aria-expanded') !== 'true') await user.click(button);
  }
}

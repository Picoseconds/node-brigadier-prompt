import chalk from 'chalk';
import boxen, { BorderStyle } from 'boxen';
import readline from 'readline';
import stripAnsi from 'strip-ansi';
import { CommandDispatcher, Suggestion } from 'node-brigadier';
import { Writable } from 'stream';

function initBrigadierPrompt(
  output: Writable,
  input: NodeJS.ReadStream,
  dispatcher: CommandDispatcher<any>,
  prompt = chalk.yellow('> ')
) {
  let promptLength = stripAnsi(prompt).length;

  const rl = readline.createInterface({
    input: input,
    output: output
  });

  let suggestionsList: Suggestion[] = [];
  let selectedSuggestion = 0;
  let hasError = false;
  let boxSize = 0;

  async function displayPrompt() {
    removeBox();
    removeSuggestions();

    readline.cursorTo(output, 0);
    readline.clearLine(output, 0);
    let parsed = dispatcher.parse(rl.line, {});

    if (parsed.getExceptions().size) {
      hasError = true;
      output.write(prompt + chalk.red.italic(rl.line));

      let count = 0;
      let error = parsed.getExceptions().values().next().value;

      output.write("\n");
      output.write(boxen(chalk.red.bold.italic.underline(error.getMessage()), {
        padding: 0,
        borderStyle: BorderStyle.Round,
        borderColor: 'red',
        margin: {
          top: 0,
          left: error.getCursor() + promptLength,
          right: 0,
          bottom: 0
        }
      }));
      count++;

      readline.moveCursor(output, 0, -(count + count * 2));
      boxSize = count + count * 2;
    } else {
      hasError = false;

      let parsed = dispatcher.parse(rl.line, {});
      let suggestions = await dispatcher.getCompletionSuggestions(parsed);
      suggestionsList = suggestions.getList();

      if (selectedSuggestion < 0) selectedSuggestion = suggestionsList.length - 1;
      if (selectedSuggestion >= suggestionsList.length) selectedSuggestion = 0;

      if (suggestionsList.length) {
        for (let i = 0; i < suggestionsList.length; i++) {
          let suggestion = suggestionsList[i];
          let start = suggestion.getRange().getStart();
          readline.cursorTo(output, promptLength + start);
          if (i === selectedSuggestion) {
            output.write(chalk.yellow.underline(suggestion.getText()));
          } else {
            output.write(chalk.blue.bold(suggestion.getText()));
          }
          readline.moveCursor(process.stdout, 0, 1);
        }
      }

      readline.moveCursor(process.stdout, 0, -suggestionsList.length);

      readline.cursorTo(output, 0);
      output.write(prompt + rl.line);
    }

    readline.cursorTo(output, promptLength + rl.cursor);
  }

  async function log(...args: any) {
    readline.clearLine(output, 0);
    readline.cursorTo(output, 0);
    console.log(...args);
    await displayPrompt();
  }

  function removeBox() {
    for (let i = 0; i < boxSize + 1; i++) {
      readline.clearLine(output, 0);
      readline.moveCursor(output, 0, 1);
    }

    readline.moveCursor(output, /* promptLength + rl.cursor */ 0, -boxSize - 1);
    boxSize = 0;
  }

  function removeSuggestions() {
    for (let i = 0; i < suggestionsList.length + 1; i++) {
      readline.clearLine(output, 0);
      readline.moveCursor(output, 0, 1);
    }

    readline.moveCursor(output, /* promptLength + rl.cursor */ 0, -suggestionsList.length - 1);
    boxSize = 0;
  }

  rl.on('line', async (input) => {
    removeBox();
    removeSuggestions();

    if (hasError) {
      try {
        dispatcher.execute(dispatcher.parse(input, {}));
      } catch (error) {
        console.log(chalk.red(error));
      }

      await displayPrompt();
    } else {
      try {
        dispatcher.execute(dispatcher.parse(input, {}));
      } catch (error) {
        console.log(chalk.red(error));
      }

      await displayPrompt();
    }
  });

  readline.emitKeypressEvents(input);

  if (input.isTTY)
    input.setRawMode(true);

  input.on('keypress', async (char, key) => {
    if (char === '\t') {
      if (suggestionsList.length) {
        let suggestion = suggestionsList[selectedSuggestion];

        if (suggestion) {
          let start = suggestion.getRange().getStart();
          (rl as any).line = rl.line.slice(0, start) + suggestion.getText();
          (rl as any).cursor = rl.line.length;
        }
      }
    }

    if (key && key.ctrl && key.name == 'c') {
      removeBox();
      removeSuggestions();
      console.log();
      process.exit();
    }

    switch (key.name) {
      case 'left':
        selectedSuggestion--;
        break;
      case 'right':
        selectedSuggestion++;
        break;
    }

    await displayPrompt();
  });

  displayPrompt();

  return {
    log: log,
    end: rl.close
  };
}

export { initBrigadierPrompt };
export default { initBrigadierPrompt };
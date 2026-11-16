# Magento Version Matrix

Builds a GitHub Actions matrix of supported Magento Open Source releases and their PHP versions from [magento.watch](https://magento.watch). When Adobe ships a new patch release, the matrix follows without an edit to your workflow.

## Usage

```yaml
jobs:
  matrix:
    runs-on: ubuntu-24.04
    permissions: {}
    outputs:
      matrix: ${{ steps.matrix.outputs.matrix }}
    steps:
      - id: matrix
        uses: lbajsarowicz/github-action-magento-matrix@v0

  test:
    needs: matrix
    runs-on: ubuntu-24.04
    strategy:
      fail-fast: false
      matrix: ${{ fromJSON(needs.matrix.outputs.matrix) }}
    name: Magento ${{ matrix.magento }} / PHP ${{ matrix.php }}
    steps:
      - run: echo "Magento ${{ matrix.magento }} on PHP ${{ matrix.php }}"
```

## Inputs

| Input | Default | Meaning |
|---|---|---|
| `versions` | `supported-latest` | `supported-latest` (newest patch of every supported release line), `latest`, `supported-all`, or a list such as `2.4.8-p5,2.4.9` |
| `php` | `boundaries` | `boundaries` (lowest and highest per release), `all`, `lowest`, `highest`, or a list such as `8.3,8.4` |
| `max-cells` | `12` | The action fails when the matrix would be larger |
| `snapshot` | empty | Path to a committed facts file; when set, magento.watch is not contacted |
| `send-repository` | `true` | Add the repository name to the request's `User-Agent`; public repositories only |

## Outputs

| Output | Meaning |
|---|---|
| `matrix` | `{"include":[{"magento":"2.4.8-p5","php":"8.4","line":"2.4.8","eol":"2028-05-31"}]}` |
| `php` | Distinct PHP versions in the matrix, such as `["8.2","8.3","8.4","8.5"]`, for jobs that need PHP but no Magento |
| `cells` | Number of cells |
| `source` | `live`, `snapshot` or `bundled` |

## Network and privacy

The action makes one request: `GET https://magento.watch/api/v1/magento-community/versions/supported`.

Its `User-Agent` names the action and version and, for public repositories, the repository:

```
github-action-magento-matrix/v0 (+https://github.com/acme/module-example)
```

The repository name shows the maintainer which public projects use the action. It is never sent for a private repository, or when GitHub's event payload does not state that the repository is public. `send-repository: false` removes it everywhere. The exact header is printed in the job log on every run. No token or other identifier is sent.

Only the release identifier, the PHP list and the end-of-support date are read from the response, and each is validated against a strict pattern. Nothing from the network can add commands, images or URLs to your workflow.

If magento.watch cannot be reached, the action warns and uses the facts bundled with the release you pinned. To run without any request, commit a facts file and pass it as `snapshot`.

## Permissions

None. The action reads no repository content and needs no token.

## Releases

Every merge to `main` publishes a release candidate (`vX.Y.Z-rc.N`). Marking a candidate as a full release retags it to `vX.Y.Z` and moves the major tag.

## License

MIT

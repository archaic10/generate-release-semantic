# Generate Release Semantic

### Description
This action calculates changes in releases using the conventional commits pattern as a base and sums it up with the last released tag, if no tag was released, the action uses the calculation of the current release as the new release.

### Example
```yml
uses: archaic10/generate-release-semantic@main
with:
    github-token: ${{ secrets.GITHUB_TOKEN }}    
```

## Diagram

![img](https://github.com/archaic10/generate-release-semantic/blob/main/img/fluxo.png)
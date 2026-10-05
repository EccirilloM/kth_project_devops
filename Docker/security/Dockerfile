FROM ghcr.io/gitleaks/gitleaks:v8.30.1
# GNU tar supports the NUL-delimited Git file list, including filenames with spaces.
RUN apk add --no-cache tar
COPY ci/scan-secrets.sh ci/check-secret-gate.sh ci/verify-secrets.sh /opt/kth-devops/
RUN sed -i 's/\r$//' /opt/kth-devops/*.sh
WORKDIR /repo
ENTRYPOINT ["/bin/bash"]
CMD ["/opt/kth-devops/scan-secrets.sh"]
